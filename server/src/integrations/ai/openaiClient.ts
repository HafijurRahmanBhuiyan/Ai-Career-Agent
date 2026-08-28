import OpenAI from "openai";
import { AIRequest, AIResponse } from "./ai.types";

const OPENAI_TIMEOUT_MS = 60000;

let clientInstance: OpenAI | null = null;

function getClient(): OpenAI {
  if (clientInstance) return clientInstance;

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not defined in environment variables");
  }

  clientInstance = new OpenAI({
    apiKey,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: 1,
  });

  return clientInstance;
}

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

export async function analyzeWithOpenAI(
  request: AIRequest
): Promise<AIResponse> {
  const client = getClient();

  const modelName = request.model || getOpenAIModel();
  const maxTokens = request.maxTokens || 4096;

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
      throw new Error("No text content in OpenAI response");
    }

    return {
      text,
      provider: "openai",
      model: modelName,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      const message = error.message;

      if (
        message.includes("401") ||
        message.toLowerCase().includes("incorrect api key") ||
        message.toLowerCase().includes("authentication")
      ) {
        throw new Error("OpenAI authentication failed: invalid API key");
      }

      if (
        message.includes("429") ||
        message.toLowerCase().includes("quota") ||
        message.toLowerCase().includes("rate limit")
      ) {
        throw new Error(
          "OpenAI rate limit or quota exceeded. Please try another AI provider."
        );
      }

      if (message.toLowerCase().includes("timeout")) {
        throw new Error("OpenAI request timed out. Please try again.");
      }
    }

    throw error;
  }
}

export function resetOpenAIClient(): void {
  clientInstance = null;
}
