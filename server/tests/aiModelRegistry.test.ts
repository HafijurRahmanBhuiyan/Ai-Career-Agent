import {
  DEFAULT_FREE_AI_MODELS,
  getProviderModels,
  getPrimaryModel,
} from "../src/integrations/ai/aiModelRegistry";

const MODEL_ENV_KEYS = [
  "CLAUDE_MODEL",
  "GEMINI_MODEL",
  "OPENAI_MODEL",
  "GROQ_MODEL",
  "OPENROUTER_MODEL",
  "CEREBRAS_MODEL",
  "MISTRAL_MODEL",
  "GEMINI_FREE_MODELS",
  "GROQ_FREE_MODELS",
  "OPENROUTER_FREE_MODELS",
  "CEREBRAS_FREE_MODELS",
  "MISTRAL_FREE_MODELS",
] as const;

function clearModelEnv() {
  for (const key of MODEL_ENV_KEYS) {
    delete process.env[key];
  }
}

const MULTI_MODEL_PROVIDERS = [
  "gemini",
  "groq",
  "openrouter",
  "cerebras",
  "mistral",
] as const;

describe("DEFAULT_FREE_AI_MODELS registry", () => {
  it("contains only multi-model (pooled) providers", () => {
    const providers = new Set(DEFAULT_FREE_AI_MODELS.map((m) => m.provider));
    for (const p of MULTI_MODEL_PROVIDERS) {
      expect(providers.has(p)).toBe(true);
    }
    for (const m of DEFAULT_FREE_AI_MODELS) {
      expect(MULTI_MODEL_PROVIDERS).toContain(m.provider);
    }
  });

  it("has unique model ids and all entries are free + enabled", () => {
    const ids = DEFAULT_FREE_AI_MODELS.map((m) => m.model);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of DEFAULT_FREE_AI_MODELS) {
      expect(m.free).toBe(true);
      expect(m.enabled).toBe(true);
      expect(m.priority).toBeGreaterThan(0);
    }
  });

  it("does not contain deprecated/retired model ids", () => {
    const ids = DEFAULT_FREE_AI_MODELS.map((m) => m.model);
    const deprecated = [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "llama-3.3-70b",
      "open-mistral-nemo",
      "meta-llama/llama-3.3-70b-instruct:free",
    ];
    for (const id of deprecated) {
      expect(ids).not.toContain(id);
    }
  });

  it("gemini free pool contains the verified flash family", () => {
    const models = getProviderModels("gemini");
    expect(models.map((m) => m.model)).toEqual([
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-3-flash-preview",
    ]);
  });

  it("groq free pool matches the current developer-plan catalog", () => {
    const models = getProviderModels("groq");
    expect(models.map((m) => m.model)).toEqual([
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.8-27b",
      "qwen/qwen3.6-27b",
    ]);
  });

  it("openrouter free pool leads with the dynamic router", () => {
    const models = getProviderModels("openrouter");
    expect(models[0].model).toBe("openrouter/free");
    expect(models.filter((m) => m.model !== "openrouter/free").length).toBeGreaterThan(0);
  });

  it("claude/openai are single-model providers", () => {
    expect(getProviderModels("claude")).toHaveLength(1);
    expect(getProviderModels("claude")[0].model).toBe("claude-sonnet-4-6");
    expect(getProviderModels("openai")).toHaveLength(1);
    expect(getProviderModels("openai")[0].model).toBe("gpt-4o-mini");
  });

  it("getPrimaryModel returns the highest-priority model per provider", () => {
    expect(getPrimaryModel("gemini")).toBe("gemini-3.8-flash");
    expect(getPrimaryModel("groq")).toBe("openai/gpt-oss-120b");
    expect(getPrimaryModel("openrouter")).toBe("openrouter/free");
    expect(getPrimaryModel("cerebras")).toBe("gpt-oss-120b");
    expect(getPrimaryModel("mistral")).toBe("mistral-small-latest");
  });
});

describe("getProviderModels env overrides", () => {
  beforeEach(() => {
    clearModelEnv();
  });

  it("GEMINI_FREE_MODELS comma-separated override replaces the defaults", () => {
    process.env.GEMINI_FREE_MODELS = "custom-a, custom-b";
    const models = getProviderModels("gemini");
    expect(models.map((m) => m.model)).toEqual(["custom-a", "custom-b"]);
  });

  it("legacy GEMINI_MODEL override is prepended (preferred-first)", () => {
    process.env.GEMINI_MODEL = "gemini-3.5-flash";
    const models = getProviderModels("gemini");
    expect(models[0].model).toBe("gemini-3.5-flash");
    expect(models[1]?.model).toBe("gemini-3.8-flash");
  });

  it("request model is prepended ahead of every override", () => {
    process.env.GROQ_MODEL = "override-model";
    process.env.GROQ_FREE_MODELS = "pool-a,pool-b";
    const models = getProviderModels("groq", "requested-model");
    expect(models.map((m) => m.model)).toEqual([
      "requested-model",
      "override-model",
      "pool-a",
      "pool-b",
    ]);
  });

  it("de-duplicates repeated model ids (first occurrence wins)", () => {
    process.env.GEMINI_MODEL = "gemini-3.8-flash";
    process.env.GEMINI_FREE_MODELS = "gemini-3.8-flash, gemini-3.7-flash";
    const models = getProviderModels("gemini");
    expect(models.map((m) => m.model)).toEqual([
      "gemini-3.8-flash",
      "gemini-3.7-flash",
    ]);
  });

  it("empty *_FREE_MODELS value falls back to registry defaults", () => {
    process.env.GROQ_FREE_MODELS = "   ";
    const models = getProviderModels("groq");
    expect(models[0].model).toBe("openai/gpt-oss-120b");
  });
});