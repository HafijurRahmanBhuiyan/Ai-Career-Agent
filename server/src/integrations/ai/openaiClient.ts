import OpenAI from "openai";
import { AppError } from "../../middleware/errorHandler";
import { AIRequest, AIResponse } from "./ai.types";

const OPENAI_TIMEOUT_MS = 60000;

let clientInstance: OpenAI | null = null;

function getClient(): OpenAI {
  if (clientInstance) return clientInstance;

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new AppError(
      "OpenAI is not configured on the server (OPENAI_API_KEY missing)",
      503
    );
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
        throw new AppError("OpenAI authentication failed: invalid API key", 500);
      }

      if (
        message.includes("429") ||
        message.toLowerCase().includes("quota") ||
        message.toLowerCase().includes("rate limit")
      ) {
        throw new AppError(
          "OpenAI rate limit or quota exceeded. Please try another AI provider.",
          429
        );
      }

      if (message.toLowerCase().includes("timeout")) {
        throw new AppError("OpenAI request timed out. Please try the analysis again.", 504);
      }

      if (
        message.toLowerCase().includes("maximum context length") ||
        message.toLowerCase().includes("token limit") ||
        message.toLowerCase().includes("too many tokens")
      ) {
        throw new AppError(
          "The repository content is too large for OpenAI. A smaller README or another AI provider may work.",
          422
        );
      }

      throw new AppError(
        `OpenAI API request failed: ${message}`.slice(0, 500),
        502
      );
    }

    throw new AppError("OpenAI API request failed. Please try again.", 502);
  }
}

export function resetOpenAIClient(): void {
  clientInstance = null;
}
