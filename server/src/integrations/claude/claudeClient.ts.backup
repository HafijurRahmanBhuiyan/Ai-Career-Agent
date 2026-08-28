import Anthropic from "@anthropic-ai/sdk";
import { ProjectAnalysisResult } from "./claude.types";

const MAX_README_CHARS = 15000;
const CLAUDE_TIMEOUT_MS = 60000;

let clientInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (clientInstance) return clientInstance;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not defined in environment variables");
  }

  clientInstance = new Anthropic({
    apiKey,
    timeout: CLAUDE_TIMEOUT_MS,
    maxRetries: 1,
  });

  return clientInstance;
}

export function getModel(): string {
  return process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
}

export function getMaxTokens(): number {
  return parseInt(process.env.CLAUDE_MAX_TOKENS || "4096", 10);
}

export function getReadmeLimit(): number {
  return MAX_README_CHARS;
}

export function truncateReadme(readme: string): { content: string; truncated: boolean } {
  if (readme.length <= MAX_README_CHARS) {
    return { content: readme, truncated: false };
  }
  return {
    content: readme.slice(0, MAX_README_CHARS) + "\n\n[README truncated at 15000 characters]",
    truncated: true,
  };
}

export async function analyzeProject(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const client = getClient();
  const model = getModel();
  const maxTokens = getMaxTokens();

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in Claude response");
    }

    return textBlock.text;
  } catch (error: unknown) {
    if (error instanceof Error) {
      const errName = error.name || "";
      const errMsg = error.message || "";

      if (errName === "AuthenticationError" || errMsg.includes("401")) {
        throw new Error("Claude authentication failed: invalid API key");
      }

      if (errName === "RateLimitError" || errMsg.includes("429")) {
        throw new Error("Claude rate limit exceeded. Please try again later.");
      }

      if (errName === "APITimeoutError" || errMsg.includes("timeout")) {
        throw new Error("Claude request timed out. Please try again.");
      }

      if (errName === "APIConnectionError") {
        throw new Error("Failed to connect to Claude API. Please try again.");
      }
    }

    throw error;
  }
}

export function resetClient(): void {
  clientInstance = null;
}
