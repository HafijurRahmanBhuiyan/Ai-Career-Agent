export type AIProvider = "claude" | "gemini" | "openai";

export interface AIRequest {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  model?: string;
}

export interface AIResponse {
  text: string;
  provider: AIProvider;
  model: string;
}

export interface AIProviderConfig {
  provider: AIProvider;
  model: string;
  available: boolean;
}
