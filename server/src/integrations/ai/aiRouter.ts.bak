import { analyzeProject as analyzeWithClaude } from "../claude/claudeClient";
import { analyzeWithGemini } from "./geminiClient";
import { analyzeWithOpenAI } from "./openaiClient";
import {
  AIProvider,
  AIRequest,
  AIResponse,
  AIProviderConfig,
} from "./ai.types";

export function getAvailableAIProviders(): AIProviderConfig[] {
  return [
    {
      provider: "claude",
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
      available: Boolean(process.env.ANTHROPIC_API_KEY),
    },
    {
      provider: "gemini",
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      available: Boolean(process.env.GEMINI_API_KEY),
    },
    {
      provider: "openai",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      available: Boolean(process.env.OPENAI_API_KEY),
    },
  ];
}

export function getDefaultAIProvider(): AIProvider {
  const configured = process.env.DEFAULT_AI_PROVIDER as AIProvider | undefined;

  if (
    configured === "claude" ||
    configured === "gemini" ||
    configured === "openai"
  ) {
    return configured;
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return "claude";
  }

  if (process.env.GEMINI_API_KEY) {
    return "gemini";
  }

  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }

  throw new Error("No AI provider API key is configured");
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

export async function analyzeWithAI(
  request: AIRequest,
  provider?: AIProvider
): Promise<AIResponse> {
  const selectedProvider = provider || getDefaultAIProvider();

  switch (selectedProvider) {
    case "claude":
      return callClaude(request);

    case "gemini":
      return analyzeWithGemini(request);

    case "openai":
      return analyzeWithOpenAI(request);

    default:
      throw new Error(`Unsupported AI provider: ${selectedProvider}`);
  }
}

export async function analyzeWithAIFallback(
  request: AIRequest,
  preferredProvider?: AIProvider
): Promise<AIResponse> {
  const providers: AIProvider[] = [
    preferredProvider || getDefaultAIProvider(),
    "claude",
    "gemini",
    "openai",
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
      return await analyzeWithAI(request, provider);
    } catch (error: unknown) {
      lastError = error;

      console.error(
        `[AI] ${provider} failed, trying next provider...`,
        error instanceof Error ? error.message : error
      );
    }
  }

  if (lastError instanceof Error) {
    throw new Error(`All configured AI providers failed: ${lastError.message}`);
  }

  throw new Error("No AI provider is available");
}
