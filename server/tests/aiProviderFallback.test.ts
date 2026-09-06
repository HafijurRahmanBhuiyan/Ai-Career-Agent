import {
  executeWithAiFallback,
  classifyAiError,
  AiProviderFailure,
} from "../src/services/aiProviderFallback";

jest.mock("../src/integrations/claude/claudeClient", () => ({
  analyzeProject: jest.fn(),
}));
jest.mock("../src/integrations/ai/geminiClient", () => ({
  analyzeWithGemini: jest.fn(),
}));
jest.mock("../src/integrations/ai/openaiClient", () => ({
  analyzeWithOpenAI: jest.fn(),
}));

const claudeClient = require("../src/integrations/claude/claudeClient");
const geminiClient = require("../src/integrations/ai/geminiClient");
const openaiClient = require("../src/integrations/ai/openaiClient");

const mockClaude = claudeClient.analyzeProject as jest.Mock;
const mockGemini = geminiClient.analyzeWithGemini as jest.Mock;
const mockOpenAI = openaiClient.analyzeWithOpenAI as jest.Mock;

const KEY_SETTINGS = [
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "DEFAULT_AI_PROVIDER",
  "CLAUDE_MODEL",
  "GEMINI_MODEL",
  "OPENAI_MODEL",
] as const;

function clearKeys() {
  for (const key of KEY_SETTINGS) {
    delete process.env[key];
  }
}

function setAllKeys() {
  process.env.ANTHROPIC_API_KEY = "k-claude";
  process.env.GEMINI_API_KEY = "k-gemini";
  process.env.OPENAI_API_KEY = "k-openai";
}

function resetMocks() {
  mockClaude.mockReset();
  mockGemini.mockReset();
  mockOpenAI.mockReset();
}

const request = {
  systemPrompt: "system",
  userMessage: "user message",
};

const ok = (text: string, provider: "claude" | "gemini" | "openai") => ({
  text,
  provider,
  model: "m",
});

// Helper to assert a provider returned via analyzeWithAI: claude -> analyzeProject,
// gemini -> analyzeWithGemini, openai -> analyzeWithOpenAI.
function assertProviderCalls(claude: number, gemini: number, openai: number) {
  expect(mockClaude).toHaveBeenCalledTimes(claude);
  expect(mockGemini).toHaveBeenCalledTimes(gemini);
  expect(mockOpenAI).toHaveBeenCalledTimes(openai);
}

describe("classifyAiError", () => {
  it("classifies quota/credit errors as insufficient_credits and fallback-eligible", () => {
    const f = classifyAiError(
      new Error("Your credit balance is too low to access the API"),
      "claude"
    );
    expect(f.category).toBe("insufficient_credits");
    expect(f.fallbackEligible).toBe(true);
    expect(f.retryable).toBe(false);
  });

  it("classifies 429 as rate_limited and fallback-eligible", () => {
    const e = new Error("rate limit exceeded") as Error & { status: number };
    e.status = 429;
    const f = classifyAiError(e, "gemini");
    expect(f.category).toBe("rate_limited");
    expect(f.fallbackEligible).toBe(true);
  });

  it("classifies 5xx as temporary and fallback-eligible", () => {
    const e = new Error("service unavailable") as Error & { status: number };
    e.status = 503;
    const f = classifyAiError(e, "openai");
    expect(f.category).toBe("overloaded");
    expect(f.fallbackEligible).toBe(true);
  });

  it("classifies authentication errors as auth_error and NOT fallback-eligible", () => {
    const f = classifyAiError(new Error("authentication failed: invalid API key"), "claude");
    expect(f.category).toBe("auth_error");
    expect(f.fallbackEligible).toBe(false);
  });

  it("classifies invalid request structure as invalid_request and NOT fallback-eligible", () => {
    const f = classifyAiError(new Error("invalid_argument: bad prompt"), "gemini");
    expect(f.category).toBe("invalid_request");
    expect(f.fallbackEligible).toBe(false);
  });

  it("classifies model not found as model_unavailable and fallback-eligible", () => {
    const f = classifyAiError(
      new Error("400 MODEL_NOT_FOUND: models/gemini-flash-lite is not found for API version v1beta"),
      "gemini-flash-lite"
    );
    expect(f.category).toBe("model_unavailable");
    expect(f.fallbackEligible).toBe(true);
  });
});

describe("executeWithAiFallback", () => {
  beforeEach(() => {
    clearKeys();
    setAllKeys();
    resetMocks();
    jest.useRealTimers();
  });

  it("1. Claude succeeds -> Gemini and OpenAI are NOT called", async () => {
    mockClaude.mockResolvedValue("claude result");
    const result = await executeWithAiFallback(request);
    expect(result.text).toBe("claude result");
    expect(result.provider).toBe("claude");
    expect(result.metadata.fallbackUsed).toBe(false);
    expect(result.metadata.attemptedProviders).toEqual(["claude"]);
    assertProviderCalls(1, 0, 0);
  });

  it("2. Claude rate-limited -> Gemini succeeds", async () => {
    mockClaude.mockRejectedValue(new Error("rate limit"));
    mockGemini.mockResolvedValue(ok("gemini result","gemini"));
    const result = await executeWithAiFallback(request);
    expect(result.text).toBe("gemini result");
    expect(result.provider).toBe("gemini");
    expect(result.metadata.fallbackUsed).toBe(true);
    expect(result.metadata.failures[0].category).toBe("rate_limited");
    assertProviderCalls(1, 1, 0);
  });

  it("3. Claude quota exhausted -> Gemini succeeds", async () => {
    mockClaude.mockRejectedValue(new Error("quota exceeded"));
    mockGemini.mockResolvedValue(ok("gemini result","gemini"));
    const result = await executeWithAiFallback(request);
    expect(result.provider).toBe("gemini");
    expect(result.metadata.failures[0].category).toBe("quota_exhausted");
    assertProviderCalls(1, 1, 0);
  });

  it("4. Claude insufficient credits -> Gemini succeeds", async () => {
    mockClaude.mockRejectedValue(new Error("Your credit balance is too low"));
    mockGemini.mockResolvedValue(ok("gemini result","gemini"));
    const result = await executeWithAiFallback(request);
    expect(result.provider).toBe("gemini");
    expect(result.metadata.failures[0].category).toBe("insufficient_credits");
    assertProviderCalls(1, 1, 0);
  });

  it("5. Claude temporary 5xx -> Gemini succeeds", async () => {
    const e = new Error("internal server error") as Error & { status: number };
    e.status = 500;
    mockClaude.mockRejectedValue(e);
    mockGemini.mockResolvedValue(ok("gemini result","gemini"));
    const result = await executeWithAiFallback(request);
    expect(result.provider).toBe("gemini");
    expect(result.metadata.failures[0].category).toBe("temporary");
    assertProviderCalls(1, 1, 0);
  });

  it("6. Claude fails -> Gemini fails -> OpenAI succeeds", async () => {
    mockClaude.mockRejectedValue(new Error("rate limit"));
    mockGemini.mockRejectedValue(new Error("quota exceeded"));
    mockOpenAI.mockResolvedValue(ok("openai result","openai"));
    const result = await executeWithAiFallback(request);
    expect(result.text).toBe("openai result");
    expect(result.provider).toBe("openai");
    expect(result.metadata.failures.map((f) => f.provider)).toEqual([
      "claude",
      "gemini",
    ]);
    assertProviderCalls(1, 1, 1);
  });

  it("7. All providers fail -> clear final error", async () => {
    mockClaude.mockRejectedValue(new Error("rate limit"));
    mockGemini.mockRejectedValue(new Error("quota exceeded"));
    mockOpenAI.mockRejectedValue(new Error("overloaded"));
    await expect(executeWithAiFallback(request)).rejects.toThrow(
      /All configured AI providers failed/
    );
    // Paid gemini + the two free gemini variants are all attempted after the
    // other paid providers exhaust their limits.
    assertProviderCalls(1, 3, 1);
  });

  it("7b. Paid providers exhausted -> free gemini fallback succeeds", async () => {
    mockClaude.mockRejectedValue(new Error("rate limit"));
    mockGemini.mockRejectedValueOnce(new Error("quota exceeded"))
      .mockResolvedValue(ok("free gemini result", "gemini"));
    mockOpenAI.mockRejectedValue(new Error("overloaded"));
    const result = await executeWithAiFallback(request);
    // gemini (paid) fails once, then gemini-free succeeds.
    expect(result.text).toBe("free gemini result");
    expect(result.metadata.fallbackUsed).toBe(true);
    expect(result.metadata.attemptedProviders).toEqual([
      "claude",
      "gemini",
      "openai",
      "gemini-free",
    ]);
    assertProviderCalls(1, 2, 1);
  });

  it("7c. Preferred free model not found -> falls back to a configured paid model", async () => {
    mockGemini.mockRejectedValue(new Error("models/gemini-flash-lite is not found for API version v1beta"));
    mockClaude.mockResolvedValue("claude result");
    const result = await executeWithAiFallback(request, {
      preferredProvider: "gemini-flash-lite",
    });
    // The free model's "not found" error is fallback-eligible, so the chain
    // moves on to the next configured provider (claude) instead of failing.
    expect(result.text).toBe("claude result");
    expect(result.provider).toBe("claude");
    expect(result.metadata.fallbackUsed).toBe(true);
    expect(result.metadata.failures[0].category).toBe("model_unavailable");
    expect(result.metadata.failures[0].fallbackEligible).toBe(true);
    assertProviderCalls(1, 1, 0);
  });

  it("8. Missing Claude key -> Gemini is attempted (Claude skipped)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockGemini.mockResolvedValue(ok("gemini result","gemini"));
    const result = await executeWithAiFallback(request);
    expect(result.provider).toBe("gemini");
    expect(result.metadata.skippedProviders).toContain("claude");
    expect(mockClaude).toHaveBeenCalledTimes(0);
    expect(mockGemini).toHaveBeenCalledTimes(1);
  });

  it("9. Missing Gemini key -> OpenAI is attempted", async () => {
    delete process.env.GEMINI_API_KEY;
    mockClaude.mockRejectedValue(new Error("rate limit"));
    mockOpenAI.mockResolvedValue(ok("openai result","openai"));
    const result = await executeWithAiFallback(request);
    expect(result.provider).toBe("openai");
    expect(result.metadata.skippedProviders).toContain("gemini");
    expect(mockGemini).toHaveBeenCalledTimes(0);
    expect(mockOpenAI).toHaveBeenCalledTimes(1);
  });

  it("10. All keys missing -> deterministic configuration error", async () => {
    clearKeys();
    await expect(executeWithAiFallback(request)).rejects.toThrow(
      /No configured AI provider/
    );
    assertProviderCalls(0, 0, 0);
  });

  it("11. Invalid Claude structured output -> fallback provider is attempted", async () => {
    mockClaude.mockResolvedValue("not valid json");
    mockGemini.mockResolvedValue(ok('{"valid": true}',"gemini"));
    const validateOutput = (text: string) => {
      JSON.parse(text);
      return text;
    };
    const result = await executeWithAiFallback(request, { validateOutput });
    expect(result.provider).toBe("gemini");
    expect(result.metadata.failures[0].category).toBe("invalid_schema");
    assertProviderCalls(1, 1, 0);
  });

  it("12. Valid Claude structured output -> no fallback", async () => {
    mockClaude.mockResolvedValue('{"valid": true}');
    const validateOutput = (text: string) => {
      JSON.parse(text);
      return text;
    };
    const result = await executeWithAiFallback(request, { validateOutput });
    expect(result.provider).toBe("claude");
    expect(result.metadata.failures).toHaveLength(0);
    assertProviderCalls(1, 0, 0);
  });

  it("13. Sensitive information is never written to logs", async () => {
    const debugSpies = ["log", "info", "warn", "error"] as const;
    const spies = debugSpies.map((m) =>
      jest.spyOn(console, m).mockImplementation(() => {})
    );
    try {
      mockClaude.mockRejectedValue(
        new Error('rate limit secret="s3cr3t" prompt="personal data"')
      );
      mockGemini.mockResolvedValue(ok("result","gemini"));
      await executeWithAiFallback({ systemPrompt: "cv content", userMessage: "gmail body with secret" });
    } finally {
      const outputs = spies.flatMap((s) => s.mock.calls).map((c) => c.join(" "));
      const joined = outputs.join(" ");
      expect(joined).not.toContain("s3cr3t");
      expect(joined).not.toContain("personal data");
      expect(joined).not.toContain("cv content");
      expect(joined).not.toContain("gmail body");
      expect(joined).not.toContain("k-claude");
      spies.forEach((s) => s.mockRestore());
    }
  });

  it("13b. retryable transient error is retried a bounded number of times on the same provider", async () => {
    const e = new Error("temporary upstream issue") as Error & { status: number };
    e.status = 500;
    mockClaude
      .mockRejectedValueOnce(e)
      .mockResolvedValueOnce("claude result after retry");
    const result = await executeWithAiFallback(request, { maxRetriesPerProvider: 1 });
    expect(result.provider).toBe("claude");
    expect(result.text).toBe("claude result after retry");
    // 1 initial + 1 retry = 2 calls, and no other provider called
    assertProviderCalls(2, 0, 0);
  });

  it("14. Preserves normalizeClassification and existing business logic (classifyCareerEmail using fallback)", async () => {
    mockClaude.mockRejectedValue(new Error("rate limit"));
    mockGemini.mockResolvedValue(
      ok(
        JSON.stringify({
          category: "interview_invitation",
          confidence: 0.9,
          summary: "Interview",
          companyName: "Acme",
          jobTitle: "Engineer",
          applicationStatus: "interview",
          actionRequired: false,
          actionDeadline: null,
        }),
        "gemini"
      )
    );
    const { ClaudeService } = require("../src/integrations/claude/claude.service");
    const service = new ClaudeService();
    const result = await service.classifyCareerEmail({
      subject: "Interview",
      from: "recruiter@acme.com",
    });
    expect(result.result.category).toBe("interview_invitation");
    expect(result.result.companyName).toBe("Acme");
    expect(result.modelUsed).toBe("m");
  });

  it("15. preferredProvider order is respected (preferred first, then claude/gemini/openai)", async () => {
    mockClaude.mockRejectedValue(new Error("rate limit"));
    mockGemini.mockRejectedValue(new Error("rate limit"));
    mockOpenAI.mockResolvedValue(ok("openai result","openai"));
    // Preferred gemini, but gemini fails; should try openai (not duplicate claude logic
    // beyond the fixed order). With all keys set, order = gemini, claude, openai.
    const result = await executeWithAiFallback(request, {
      preferredProvider: "gemini",
    });
    expect(result.provider).toBe("openai");
    expect(result.metadata.attemptedProviders).toEqual(["gemini", "claude", "openai"]);
  });
});
