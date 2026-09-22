import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";

const KEY_SETTINGS = [
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "CEREBRAS_API_KEY",
  "MISTRAL_API_KEY",
  "DEFAULT_AI_PROVIDER",
  "CLAUDE_MODEL",
  "GEMINI_MODEL",
  "OPENAI_MODEL",
  "GROQ_MODEL",
  "OPENROUTER_MODEL",
  "CEREBRAS_MODEL",
  "MISTRAL_MODEL",
] as const;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

function clearKeys() {
  for (const key of KEY_SETTINGS) {
    delete process.env[key];
  }
}

describe("AI Providers Endpoint", () => {
  it("should list all seven providers with availability", async () => {
    clearKeys();
    process.env.ANTHROPIC_API_KEY = "test-claude-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    process.env.CEREBRAS_API_KEY = "test-cerebras-key";
    process.env.MISTRAL_API_KEY = "test-mistral-key";

    const res = await request(app).get("/api/ai/providers").expect(200);

    expect(res.body.providers).toHaveLength(7);
    const claude = res.body.providers.find(
      (p: { provider: string }) => p.provider === "claude"
    );
    const gemini = res.body.providers.find(
      (p: { provider: string }) => p.provider === "gemini"
    );
    const openai = res.body.providers.find(
      (p: { provider: string }) => p.provider === "openai"
    );
    const groq = res.body.providers.find(
      (p: { provider: string }) => p.provider === "groq"
    );
    const openrouter = res.body.providers.find(
      (p: { provider: string }) => p.provider === "openrouter"
    );
    const cerebras = res.body.providers.find(
      (p: { provider: string }) => p.provider === "cerebras"
    );
    const mistral = res.body.providers.find(
      (p: { provider: string }) => p.provider === "mistral"
    );

    expect(claude).toMatchObject({
      provider: "claude",
      model: "claude-sonnet-4-6",
      available: true,
    });
    expect(gemini).toMatchObject({
      provider: "gemini",
      model: "gemini-3.8-flash",
      available: true,
    });
    expect(openai).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      available: true,
    });
    expect(groq).toMatchObject({
      provider: "groq",
      model: "openai/gpt-oss-120b",
      available: true,
    });
    expect(openrouter).toMatchObject({
      provider: "openrouter",
      model: "openrouter/free",
      available: true,
    });
    expect(cerebras).toMatchObject({
      provider: "cerebras",
      model: "gpt-oss-120b",
      available: true,
    });
    expect(mistral).toMatchObject({
      provider: "mistral",
      model: "mistral-small-latest",
      available: true,
    });
  });

  it("should mark unconfigured providers as unavailable", async () => {
    clearKeys();
    process.env.GEMINI_API_KEY = "test-gemini-key";

    const res = await request(app).get("/api/ai/providers").expect(200);

    const gemini = res.body.providers.find(
      (p: { provider: string }) => p.provider === "gemini"
    );
    const claude = res.body.providers.find(
      (p: { provider: string }) => p.provider === "claude"
    );

    expect(gemini.available).toBe(true);
    expect(claude.available).toBe(false);
  });

  it("should use DEFAULT_AI_PROVIDER when set", async () => {
    clearKeys();
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.DEFAULT_AI_PROVIDER = "gemini";

    const res = await request(app).get("/api/ai/providers").expect(200);

    expect(res.body.defaultProvider).toBe("gemini");
  });

  it("should return null defaultProvider when no provider is configured", async () => {
    clearKeys();

    const res = await request(app).get("/api/ai/providers").expect(200);

    expect(res.body.defaultProvider).toBeNull();
    expect(
      res.body.providers.every((p: { available: boolean }) => !p.available)
    ).toBe(true);
  });
});
