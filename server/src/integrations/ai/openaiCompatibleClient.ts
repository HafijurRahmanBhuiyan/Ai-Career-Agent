import OpenAI from "openai";
import { AppError } from "../../middleware/errorHandler";
import { AIProvider, AIRequest, AIResponse } from "./ai.types";
import { getPrimaryModel } from "./aiModelRegistry";

const OPENAI_COMPATIBLE_TIMEOUT_MS = 60000;

export interface OpenAICompatibleProviderDef {
  provider: AIProvider;
  apiKeyEnv: string;
  modelEnv: string;
  baseURL: string;
  defaultModel: string;
}

/**
 * Free / low-cost AI providers that speak the OpenAI chat-completions REST
 * protocol. Each provider is configured purely via env vars, so adding an API
 * key to `.env` is enough to make it available to the fallback chain.
 *
 * `defaultModel` is the CURRENT verified primary free model for each provider
 * (see DEFAULT_FREE_AI_MODELS in `aiModelRegistry.ts`). Request-level model
 * selection (request.model), the legacy `*_MODEL` override, and the
 * `*_FREE_MODELS` pool override all take precedence over this fallback.
 */
export const FREE_PROVIDER_CONFIG: OpenAICompatibleProviderDef[] = [
  {
    provider: "groq",
    apiKeyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
  },
  {
    provider: "openrouter",
    apiKeyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/free",
  },
  {
    provider: "cerebras",
    apiKeyEnv: "CEREBRAS_API_KEY",
    modelEnv: "CEREBRAS_MODEL",
    baseURL: "https://api.cerebras.ai/v1",
    defaultModel: "gpt-oss-120b",
  },
  {
    provider: "mistral",
    apiKeyEnv: "MISTRAL_API_KEY",
    modelEnv: "MISTRAL_MODEL",
    baseURL: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
  },
];

function getProviderDef(provider: AIProvider): OpenAICompatibleProviderDef {
  const def = FREE_PROVIDER_CONFIG.find((item) => item.provider === provider);
  if (!def) {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
  return def;
}

export function getFreeProviderModel(provider: AIProvider): string {
  // Resolve through the model registry so the `*_FREE_MODELS` pool override
  // and legacy `*_MODEL` override are honored before the config default.
  return getPrimaryModel(provider);
}

export function isFreeProviderConfigured(provider: AIProvider): boolean {
  const def = getProviderDef(provider);
  return Boolean(process.env[def.apiKeyEnv]);
}

async function analyzeViaOpenAICompatible(
  request: AIRequest,
  provider: AIProvider
): Promise<AIResponse> {
  const def = getProviderDef(provider);
  const apiKey = process.env[def.apiKeyEnv];

  if (!apiKey) {
    throw new AppError(
      `${def.provider} is not configured on the server (${def.apiKeyEnv} missing)`,
      503
    );
  }

  const modelName = request.model || getFreeProviderModel(provider);
  const maxTokens = request.maxTokens || 4096;

  const client = new OpenAI({
    apiKey,
    baseURL: def.baseURL,
    timeout: OPENAI_COMPATIBLE_TIMEOUT_MS,
    maxRetries: 1,
  });

  try {
    const response = await client.chat.completions.create({
      model: modelName,
      max_tokens: maxTokens,
      messages: [
        {
          role: "system",
          content: request.systemPrompt,
        },
        {
          role: "user",
          content: request.userMessage,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;

    if (!text) {
      throw new Error("No text content in AI response");
    }

    return {
      text,
      provider,
      model: modelName,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      const message = error.message;

      if (
        message.includes("401") ||
        message.toLowerCase().includes("incorrect api key") ||
        message.toLowerCase().includes("authentication") ||
        message.toLowerCase().includes("no auth credentials")
      ) {
        throw new AppError(
          `${def.provider} authentication failed: invalid API key`,
          500
        );
      }

      if (
        message.includes("429") ||
        message.toLowerCase().includes("quota") ||
        message.toLowerCase().includes("rate limit") ||
        message.toLowerCase().includes("credit")
      ) {
        throw new AppError(
          `${def.provider} rate limit or quota exceeded. Please try another AI provider.`,
          429
        );
      }

      if (message.toLowerCase().includes("timeout")) {
        throw new AppError(
          `${def.provider} request timed out. Please try the analysis again.`,
          504
        );
      }

      if (
        message.toLowerCase().includes("maximum context length") ||
        message.toLowerCase().includes("token limit") ||
        message.toLowerCase().includes("too many tokens")
      ) {
        throw new AppError(
          `The repository content is too large for ${def.provider}. A smaller README or another AI provider may work.`,
          422
        );
      }

      throw new AppError(
        `${def.provider} API request failed: ${message}`.slice(0, 500),
        502
      );
    }

    throw new AppError(`${def.provider} API request failed. Please try again.`, 502);
  }
}

export function analyzeWithGroq(request: AIRequest): Promise<AIResponse> {
  return analyzeViaOpenAICompatible(request, "groq");
}

export function analyzeWithOpenRouter(request: AIRequest): Promise<AIResponse> {
  return analyzeViaOpenAICompatible(request, "openrouter");
}

export function analyzeWithCerebras(request: AIRequest): Promise<AIResponse> {
  return analyzeViaOpenAICompatible(request, "cerebras");
}

export function analyzeWithMistral(request: AIRequest): Promise<AIResponse> {
  return analyzeViaOpenAICompatible(request, "mistral");
}