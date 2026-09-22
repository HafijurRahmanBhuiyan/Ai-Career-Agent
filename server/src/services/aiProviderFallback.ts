import { analyzeWithProviderFallback, getAvailableAIProviders, ALL_PROVIDER_ORDER } from "../integrations/ai/aiRouter";
import { AIProvider, AIRequest, AIResponse } from "../integrations/ai/ai.types";
import { classifyAiError } from "../integrations/ai/aiErrorClassifier";
import type { AiProviderFailure } from "../integrations/ai/aiErrorClassifier";

// Re-export the shared AI error classifier (moved to
// ../integrations/ai/aiErrorClassifier so both aiRouter and this module can
// use it without a circular import). Existing importers keep working.
export {
  classifyAiError,
  toSafeMessage,
  FALLBACK_ELIGIBLE_CATEGORIES,
  NEVER_RETRY_CATEGORIES,
  NO_SAME_PROVIDER_RETRY,
} from "../integrations/ai/aiErrorClassifier";
export type {
  AiFailureCategory,
  AiProviderFailure,
} from "../integrations/ai/aiErrorClassifier";

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

const PROVIDER_ORDER: AIProvider[] = [...ALL_PROVIDER_ORDER];

/**
 * Centralized AI provider fallback executor.
 *
 * Tries providers in order: preferred (or config-derived default) -> claude ->
 * gemini -> openai -> groq -> openrouter -> cerebras -> mistral. A provider is
 * skipped entirely if its API key is not configured. Inside a provider, every
 * enabled free model from the model registry is tried in priority order before
 * moving on; models within one provider share the same quota (no synthetic
 * quota multiplication). On a retryable/capacity error (quota, credits, rate
 * limit, overload, 5xx, timeout, unavailable, model not found), the next model
 * or provider is tried. Errors that indicate a bad application request or
 * provider misconfiguration do NOT trigger fallback. If a `validateOutput`
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
        response = await analyzeWithProviderFallback(request, provider);
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