import { analyzeWithAI, getAvailableAIProviders } from "../integrations/ai/aiRouter";
import { AIProvider, AIRequest, AIResponse } from "../integrations/ai/ai.types";

export type AiFailureCategory =
  | "quota_exhausted"
  | "insufficient_credits"
  | "rate_limited"
  | "overloaded"
  | "temporary"
  | "timeout"
  | "unavailable"
  | "model_unavailable"
  | "auth_error"
  | "invalid_input"
  | "invalid_schema"
  | "invalid_request"
  | "unknown";

export interface AiProviderFailure {
  provider: AIProvider;
  category: AiFailureCategory;
  reason: string;
  retryable: boolean;
  fallbackEligible: boolean;
}

export interface AiFallbackMetadata {
  providerUsed: AIProvider | null;
  attemptedProviders: AIProvider[];
  skippedProviders: AIProvider[];
  fallbackUsed: boolean;
  failures: AiProviderFailure[];
}

export interface AiFallbackResult {
  text: string;
  provider: AIProvider;
  model: string;
  metadata: AiFallbackMetadata;
}

export interface AiFallbackOptions {
  preferredProvider?: AIProvider;
  /**
   * Optional validator for structured output. When provided, each provider's
   * text response is parsed/validated; a malformed or schema-invalid result is
   * treated as a failure of that provider and, when fallback-eligible, the next
   * configured provider is attempted. Invalid structured output is never
   * accepted silently.
   */
  validateOutput?: (text: string) => string;
  /**
   * Bounded per-provider retries for transient (retryable) errors. Long retry
   * loops are avoided. Known quota/credit/rate-limit errors are never retried.
   */
  maxRetriesPerProvider?: number;
}

const PROVIDER_ORDER: AIProvider[] = [
  "claude",
  "gemini",
  "openai",

];

// Categories that indicate a capacity/provider-side problem and therefore
// justify trying another configured provider.
const FALLBACK_ELIGIBLE_CATEGORIES: ReadonlySet<AiFailureCategory> = new Set([
  "quota_exhausted",
  "insufficient_credits",
  "rate_limited",
  "overloaded",
  "temporary",
  "timeout",
  "unavailable",
  "model_unavailable",
  "unknown",
]);

// Categories that indicate a bad request / configuration and must NOT be
// papered over by retrying another provider.
const NEVER_RETRY_CATEGORIES: ReadonlySet<AiFailureCategory> = new Set([
  "auth_error",
  "invalid_input",
  "invalid_schema",
  "invalid_request",
]);

// Categories that represent known capacity/billing exhaustion. Retrying these
// on the SAME provider is pointless and wasteful, so they are marked
// non-retryable (but remain fallback-eligible so another configured provider
// is attempted).
const NO_SAME_PROVIDER_RETRY: ReadonlySet<AiFailureCategory> = new Set([
  "quota_exhausted",
  "insufficient_credits",
  "rate_limited",
]);

function toSafeMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || String(error);
  }
  return String(error);
}

/**
 * Classify an AI provider error into a category without exposing raw provider
 * internals. The returned reason is a short, safe, human-readable message
 * (never a stack trace, raw response body, or sensitive payload).
 */
export function classifyAiError(
  error: unknown,
  provider: AIProvider
): AiProviderFailure {
  const name = error instanceof Error ? error.name : "";
  const message = toSafeMessage(error);
  const low = message.toLowerCase();
  const status =
    typeof (error as { status?: unknown }).status === "number"
      ? ((error as { status: number }).status as number)
      : null;

  let category: AiFailureCategory = "unknown";

  if (status === 429 || status === 403 || low.includes("rate limit") || low.includes("429")) {
    category = "rate_limited";
  } else if (
    low.includes("quota") ||
    low.includes("resource exhausted") ||
    low.includes("insufficient_quota")
  ) {
    category = "quota_exhausted";
  } else if (
    low.includes("credit") ||
    low.includes("billing") ||
    low.includes("balance is too low") ||
    low.includes("payment required") ||
    low.includes("402")
  ) {
    category = "insufficient_credits";
  } else if (
    low.includes("overloaded") ||
    low.includes("overload") ||
    low.includes("capacity") ||
    status === 503 ||
    name.toLowerCase().includes("overloaded")
  ) {
    category = "overloaded";
  } else if (
    low.includes("timed out") ||
    low.includes("timeout") ||
    name === "APITimeoutError" ||
    low.includes("aborted") ||
    low.includes("econnreset") ||
    low.includes("fetch failed")
  ) {
    category = "timeout";
  } else if (
    low.includes("failed to connect") ||
    low.includes("connection error") ||
    name === "APIConnectionError" ||
    low.includes("network") ||
    low.includes("unavailable") ||
    low.includes("service unavailable")
  ) {
    category = "unavailable";
  } else if (
    (status === 401 || status === 403 && low.includes("api key")) ||
    low.includes("authentication failed") ||
    low.includes("invalid api key") ||
    low.includes("incorrect api key") ||
    name === "AuthenticationError"
  ) {
    category = "auth_error";
  } else if (
    (status !== null && status >= 500 && status <= 599) ||
    low.includes(" internal error") ||
    name === "InternalServerError"
  ) {
    category = "temporary";
  } else if (
    low.includes("invalid json") ||
    low.includes("failed to parse") ||
    low.includes("failed to validate") ||
    low.includes("schema")
  ) {
    category = "invalid_schema";
  } else if (
    low.includes("model not found") ||
    low.includes("model_not_found") ||
    low.includes("not found for api version") ||
    low.includes("is not found") ||
    low.includes("does not support") ||
    low.includes("models/") && low.includes("not found") ||
    low.includes("found in the model list") ||
    low.includes("model is not available") ||
    low.includes("not supported for this model")
  ) {
    category = "model_unavailable";
  } else if (
    (status !== null && status >= 400 && status < 500) ||
    low.includes("invalid request") ||
    low.includes("invalid input") ||
    low.includes("bad request") ||
    low.includes("invalid_argument")
  ) {
    category = "invalid_request";
  }

  const retryable =
    !NEVER_RETRY_CATEGORIES.has(category) &&
    !NO_SAME_PROVIDER_RETRY.has(category);
  const fallbackEligible = FALLBACK_ELIGIBLE_CATEGORIES.has(category);

  return {
    provider,
    category,
    reason: category === "unknown" ? "unknown_provider_error" : category,
    retryable,
    fallbackEligible,
  };
}

/**
 * Centralized AI provider fallback executor.
 *
 * Tries providers in order: preferred (or config-derived default) -> claude ->
 * gemini -> openai -> gemini-free -> gemini-flash-lite. A provider is skipped
 * entirely if its API key is not configured. On a retryable/capacity error
 * (quota, credits, rate limit, overload, 5xx, timeout, unavailable), the next
 * configured provider is tried. Errors that indicate a bad application request
 * or provider misconfiguration do NOT trigger fallback. If a `validateOutput`
 * validator is supplied, a malformed/schema-invalid provider response is
 * treated as a failure and the next eligible provider is attempted. Never
 * fabricates a result when all providers fail.
 */
export async function executeWithAiFallback(
  request: AIRequest,
  options: AiFallbackOptions = {}
): Promise<AiFallbackResult> {
  const {
    preferredProvider,
    validateOutput,
    maxRetriesPerProvider = 0,
  } = options;

  const available = getAvailableAIProviders();

  const configsByProvider = new Map(
    available.map((c) => [c.provider, c] as const)
  );

  const order: AIProvider[] = [];
  if (preferredProvider) order.push(preferredProvider);
  for (const p of PROVIDER_ORDER) {
    if (preferredProvider && p === preferredProvider) continue;
    order.push(p);
  }

  const attemptedProviders: AIProvider[] = [];
  const skippedProviders: AIProvider[] = [];
  const failures: AiProviderFailure[] = [];

  for (const provider of order) {
    const config = configsByProvider.get(provider);
    if (!config?.available) {
      skippedProviders.push(provider);
      continue;
    }

    attemptedProviders.push(provider);

    for (let attempt = 0; attempt <= maxRetriesPerProvider; attempt++) {
      let response: AIResponse;
      try {
        response = await analyzeWithAI(request, provider);
      } catch (error: unknown) {
        const failure = classifyAiError(error, provider);

        if (
          failure.retryable &&
          attempt < maxRetriesPerProvider
        ) {
          // Brief bounded backoff for transient errors, then a single retry on
          // the same provider. Never retry known quota/credit/rate-limit errors.
          await sleep(retryDelayMs(attempt));
          failures.push(failure);
          continue;
        }

        failures.push(failure);
        logFailure(failure);
        if (failure.fallbackEligible) {
          break; // move to next provider
        }
        throw buildFinalError(failure, attemptedProviders);
      }

      // Optional structured-output validation. Invalid output = provider failure.
      if (validateOutput) {
        try {
          const validated = validateOutput(response.text);
          if (validated === undefined || validated === null) {
            throw new Error("structured output did not validate");
          }
          response = { ...response, text: validated };
        } catch (error: unknown) {
          const failure: AiProviderFailure = {
            provider,
            category: "invalid_schema",
            reason: "invalid_schema",
            retryable: true,
            fallbackEligible: true,
          };
          failures.push(failure);
          logFailure(failure);
          break; // invalid structured output -> try next provider
        }
      }

      // fallbackUsed is true when a provider failed before this one succeeded.
      const fallbackUsed = failures.length > 0;
      if (fallbackUsed) {
        console.info(`[AI] provider ${provider} succeeded after fallback`);
      }

      return {
        text: response.text,
        provider: response.provider,
        model: response.model,
        metadata: {
          providerUsed: provider,
          attemptedProviders: [...attemptedProviders],
          skippedProviders: [...skippedProviders],
          fallbackUsed,
          failures: [...failures],
        },
      };
    }
  }

  const finalError = buildFinalError(failures[failures.length - 1] || null, attemptedProviders);
  throw finalError;
}

function buildFinalError(
  lastFailure: AiProviderFailure | null,
  attemptedProviders: AIProvider[]
): Error {
  if (lastFailure) {
    return new Error(
      `All configured AI providers failed. ` +
        `Attempted: ${attemptedProviders.join(", ")}. ` +
        `Category: ${lastFailure.category}.`
    );
  }
  throw new Error(
    "No configured AI provider is available. Check API key configuration."
  );
}

function retryDelayMs(attempt: number): number {
  // Small bounded backoff: 150ms, 300ms. Avoids long retry loops.
  return 150 * Math.pow(2, attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logFailure(failure: AiProviderFailure): void {
  // Log only safe operational information. No prompts, no bodies, no secrets.
  console.info(
    `[AI] provider ${failure.provider} failed: ${failure.category}; ` +
      `fallbackEligible=${failure.fallbackEligible}`
  );
}
