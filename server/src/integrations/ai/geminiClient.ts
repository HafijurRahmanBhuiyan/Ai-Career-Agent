import { GoogleGenerativeAI } from "@google/generative-ai";
import { AppError } from "../../middleware/errorHandler";
import { AIRequest, AIResponse } from "./ai.types";

const GEMINI_TIMEOUT_MS = 60000;

let clientInstance: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (clientInstance) return clientInstance;

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new AppError(
      "Gemini AI is not configured on the server (GEMINI_API_KEY missing)",
      503
    );
  }

  clientInstance = new GoogleGenerativeAI(apiKey);

  return clientInstance;
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.6-flash";
}

export async function analyzeWithGemini(
  request: AIRequest
): Promise<AIResponse> {
  const client = getClient();

  const modelName = request.model || getGeminiModel();

  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: request.systemPrompt,
  });

  try {
    const result = await Promise.race([
      model.generateContent(request.userMessage),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Gemini request timed out")),
          GEMINI_TIMEOUT_MS
        )
      ),
    ]);

    const text = result.response.text();

    if (!text) {
      throw new Error("No text content in Gemini response");
    }

    return {
      text,
      provider: "gemini",
      model: modelName,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      const message = error.message;

      if (
        message.includes("401") ||
        message.toLowerCase().includes("api key") ||
        message.toLowerCase().includes("authentication")
      ) {
        throw new AppError("Gemini authentication failed: invalid API key", 500);
      }

      if (
        message.includes("429") ||
        message.toLowerCase().includes("quota") ||
        message.toLowerCase().includes("resource exhausted")
      ) {
        throw new AppError(
          "Gemini rate limit or quota exceeded. Please try another AI provider.",
          429
        );
      }

      if (message.toLowerCase().includes("timed out")) {
        throw new AppError("Gemini request timed out. Please try the analysis again.", 504);
      }

      if (
        message.toLowerCase().includes("prompt too long") ||
        message.toLowerCase().includes("maximum input token")
      ) {
        throw new AppError(
          "The repository content is too large for Gemini. A smaller README or another AI provider may work.",
          422
        );
      }

      throw new AppError(
        `Gemini API request failed: ${message}`.slice(0, 500),
        502
      );
    }

    throw new AppError("Gemini API request failed. Please try again.", 502);
  }
}

export function resetGeminiClient(): void {
  clientInstance = null;
}
