import { AIProvider } from "./ai.types";

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

// Categories that indicate a capacity/provider-side problem and therefore
// justify trying another configured provider.
export const FALLBACK_ELIGIBLE_CATEGORIES: ReadonlySet<AiFailureCategory> =
  new Set([
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
export const NEVER_RETRY_CATEGORIES: ReadonlySet<AiFailureCategory> = new Set([
  "auth_error",
  "invalid_input",
  "invalid_schema",
  "invalid_request",
]);

// Categories that represent known capacity/billing exhaustion. Retrying these
// on the SAME provider is pointless and wasteful, so they are marked
// non-retryable (but remain fallback-eligible so another configured provider
// or model is attempted).
export const NO_SAME_PROVIDER_RETRY: ReadonlySet<AiFailureCategory> = new Set([
  "quota_exhausted",
  "insufficient_credits",
  "rate_limited",
]);

export function toSafeMessage(error: unknown): string {
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
    low.includes("insufficient_quota") ||
    low.includes("usage limit") ||
    low.includes("usage cap") ||
    low.includes("free plan") ||
    low.includes("daily limit") ||
    low.includes("limit reached")
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