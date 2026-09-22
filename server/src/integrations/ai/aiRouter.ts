import { analyzeProject as analyzeWithClaude } from "../claude/claudeClient";
import { analyzeWithGemini } from "./geminiClient";
import { analyzeWithOpenAI } from "./openaiClient";
import {
  analyzeWithCerebras,
  analyzeWithGroq,
  analyzeWithMistral,
  analyzeWithOpenRouter,
} from "./openaiCompatibleClient";
import { AppError } from "../../middleware/errorHandler";
import {
  AIProvider,
  AIRequest,
  AIResponse,
  AIProviderConfig,
} from "./ai.types";
import { classifyAiError, toSafeMessage } from "./aiErrorClassifier";
import type { AiProviderFailure } from "./aiErrorClassifier";
import { getProviderModels, getPrimaryModel } from "./aiModelRegistry";

export const ALL_PROVIDER_ORDER: AIProvider[] = [
  "claude",
  "gemini",
  "openai",
  "groq",
  "openrouter",
  "cerebras",
  "mistral",
];

const PROVIDER_KEY_ENV: Record<AIProvider, string> = {
  claude: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

function isKnownProvider(value: string): value is AIProvider {
  return (ALL_PROVIDER_ORDER as readonly string[]).includes(value);
}

export function isProviderConfigured(provider: AIProvider): boolean {
  return Boolean(process.env[PROVIDER_KEY_ENV[provider]]);
}

export function getAvailableAIProviders(): AIProviderConfig[] {
  return ALL_PROVIDER_ORDER.map((provider) => ({
    provider,
    model: getPrimaryModel(provider),
    available: isProviderConfigured(provider),
  }));
}

export function getDefaultAIProvider(): AIProvider {
  const configured = process.env.DEFAULT_AI_PROVIDER;

  if (configured && isKnownProvider(configured)) {
    return configured as AIProvider;
  }

  for (const provider of ALL_PROVIDER_ORDER) {
    if (isProviderConfigured(provider)) {
      return provider;
    }
  }

  throw new AppError("No AI provider API key is configured", 503);
}

async function callClaude(request: AIRequest): Promise<AIResponse> {
  const text = await analyzeWithClaude(
    request.systemPrompt,
    request.userMessage
  );

  return {
    text,
    provider: "claude",
    model: request.model || process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
  };
}

/**
 * Dispatch a single provider call. `request.model` (if set) selects the exact
 * model to use; otherwise each client falls back to its own configured default.
 */
async function callProvider(
  request: AIRequest,
  provider: AIProvider
): Promise<AIResponse> {
  switch (provider) {
    case "claude":
      return callClaude(request);

    case "gemini":
      return analyzeWithGemini(request);

    case "openai":
      return analyzeWithOpenAI(request);

    case "groq":
      return analyzeWithGroq(request);

    case "openrouter":
      return analyzeWithOpenRouter(request);

    case "cerebras":
      return analyzeWithCerebras(request);

    case "mistral":
      return analyzeWithMistral(request);

    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

export async function analyzeWithAI(
  request: AIRequest,
  provider?: AIProvider
): Promise<AIResponse> {
  const selectedProvider = provider || getDefaultAIProvider();
  return callProvider(request, selectedProvider);
}

/**
 * Model-level fallback inside a single provider.
 *
 * Tries every enabled model from the model registry for `provider` in priority
 * order. A fallback-eligible error (model not found, 429, quota, overload,
 * 5xx, timeout, unavailable) moves on to the next model; an application/config
 * error (auth, invalid input/schema/request) is rethrown immediately so it is
 * never papered over. When every model of a provider fails, one aggregate
 * error is thrown carrying the last model's status so the caller can classify
 * it and decide whether to move on to the next provider. Models of one
 * provider share the same quota, so this never inflates capacity.
 */
export async function analyzeWithProviderFallback(
  request: AIRequest,
  provider: AIProvider
): Promise<AIResponse> {
  const models = getProviderModels(provider, request.model);

  let lastError: unknown = null;
  let lastFailure: AiProviderFailure = {
    provider,
    category: "unknown",
    reason: "unknown_provider_error",
    retryable: true,
    fallbackEligible: true,
  };

  for (const modelConfig of models) {
    if (!modelConfig.enabled) continue;

    try {
      return await callProvider(
        { ...request, model: modelConfig.model },
        provider
      );
    } catch (error: unknown) {
      lastError = error;
      const failure = classifyAiError(error, provider);
      lastFailure = failure;

      if (!failure.fallbackEligible) {
        // Bad request / misconfiguration: never cycle through the pool.
        throw error;
      }

      console.info(
        `[AI] ${provider} model ${modelConfig.model} failed: ` +
          `${failure.category}; trying next model...`
      );
    }
  }

  throw buildModelPoolError(provider, lastError, lastFailure);
}

function buildModelPoolError(
  provider: AIProvider,
  lastError: unknown,
  lastFailure: AiProviderFailure
): Error {
  const source = lastError as { status?: unknown; statusCode?: unknown } | null;
  const rawStatus =
    typeof source?.status === "number"
      ? (source.status as number)
      : typeof source?.statusCode === "number"
        ? (source.statusCode as number)
        : null;

  const message = `All ${provider} models failed: ${toSafeMessage(lastError).slice(0, 300)}`;

  const error = new AppError(message, rawStatus ?? 502);
  // Preserve the raw status ONLY when the source error actually carried one,
  // otherwise classifyAiError() would treat the fabricated 502 as a 5xx and
  // misclassify (e.g. a "model not found" message as "temporary").
  if (rawStatus !== null) {
    (error as Error & { status?: number }).status = rawStatus;
  }
  return error;
}

export async function analyzeWithAIFallback(
  request: AIRequest,
  preferredProvider?: AIProvider
): Promise<AIResponse> {
  const providers: AIProvider[] = [
    preferredProvider || getDefaultAIProvider(),
    ...ALL_PROVIDER_ORDER,
  ];

  const uniqueProviders = [...new Set(providers)];

  let lastError: unknown = null;

  for (const provider of uniqueProviders) {
    const config = getAvailableAIProviders().find(
      (item) => item.provider === provider
    );

    if (!config?.available) {
      continue;
    }

    try {
      return await analyzeWithProviderFallback(request, provider);
    } catch (error: unknown) {
      lastError = error;

      console.error(
        `[AI] ${provider} failed, trying next provider...`,
        error instanceof Error ? error.message : error
      );
    }
  }

  if (lastError instanceof Error) {
    throw new AppError(
      `All configured AI providers failed: ${lastError.message}`.slice(0, 500),
      503
    );
  }

  throw new AppError("No AI provider is available", 503);
}