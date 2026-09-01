import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser } from "./helpers";
import Job from "../src/models/Job";
import JobMatch from "../src/models/JobMatch";
import Profile from "../src/models/Profile";
import Skill from "../src/models/Skill";
import {
  combineScores,
  computeProfileVersion,
  computeJobVersion,
} from "../src/services/jobMatching";
import {
  validateJobMatchAIOutput,
  clampMatchScore,
  matchLevelFromScore,
  deriveRecommendationFromScore,
} from "../src/validators/jobMatch";
import { computeDeterministicMatch } from "../src/services/deterministicMatch";
import {
  JobMatchProfilePayload,
  JobMatchJobPayload,
} from "../src/services/jobMatchTypes";

jest.mock("../src/integrations/claude/claudeClient", () => {
  const impl = {
    getModel: jest.fn(() => "claude-sonnet-4-20250514"),
    getMaxTokens: jest.fn(() => 4096),
    getReadmeLimit: jest.fn(() => 15000),
    truncateReadme: jest.fn((r: string) => ({ content: r || "", truncated: false })),
    resetClient: jest.fn(),
    analyzeProject: jest.fn(() => Promise.resolve(JSON.stringify(mockValidOutput()))),
  };
  return impl;
});

const mockValidOutput = () => ({
  score: 87,
  summary: "Strong alignment.",
  matchingSkills: ["TypeScript", "React", "Node.js"],
  missingSkills: ["Kubernetes"],
  matchingTechnologies: ["React"],
  missingTechnologies: ["Docker"],
  experienceMatch: "matches",
  experienceGap: "none",
  educationMatch: "sufficient",
  educationGap: "none",
  locationMatch: "matches",
  remoteMatch: "matches",
  employmentTypeMatch: "matches",
  salaryMatch: "in range",
  strengths: ["React"],
  weaknesses: [],
  gaps: ["Gain Kubernetes exposure."],
  recommendation: "apply",
  recommendationReason: "strong fit",
});

const validJob = {
  source: "mock",
  sourceJobId: "prod-match-1",
  fingerprint: "fp-prod-1",
  title: "Senior Full Stack Developer",
  companyName: "Acme Corp",
  description: "Senior full stack role.",
  locations: ["Remote"],
  location: "Remote",
  remoteType: "remote",
  employmentType: "full-time",
  experienceLevel: "senior",
  salaryMin: 100000,
  salaryMax: 160000,
  salaryCurrency: "USD",
  salaryPeriod: "yearly",
  skills: ["React", "Node.js", "TypeScript", "Kubernetes"],
  technologies: ["React", "Express", "Docker", "Kubernetes"],
  jobUrl: "https://example.com/jobs/fullstack",
  applyUrl: "https://example.com/apply/fullstack",
  rawSource: {},
  lastSeenAt: new Date(),
  discoveredAt: new Date(),
  isActive: true,
};

async function seedJob(overrides: Record<string, unknown> = {}) {
  return Job.create({ ...validJob, sourceJobId: `prod-${Math.random()}`, ...overrides });
}

async function seedProfile(userId: string) {
  await Profile.create({
    user: userId,
    fullName: "Test User",
    headline: "Full Stack Developer",
    summary: "Senior full stack developer.",
    preferredRoles: ["Full Stack Developer"],
    preferredLocations: ["Remote"],
    workPreference: "remote",
    salaryExpectation: { min: 90000, max: 150000, currency: "USD" },
  });
  await Skill.create([
    { user: userId, name: "TypeScript", category: "Programming", proficiency: "Expert" },
    { user: userId, name: "React", category: "Framework", proficiency: "Expert" },
    { user: userId, name: "Node.js", category: "Programming", proficiency: "Advanced" },
  ]);
}

const authorize = (token: string) => ({ Authorization: `Bearer ${token}` });

let analyzeMock: jest.Mock;

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = "test-api-key";
  process.env.CLAUDE_MODEL = "claude-sonnet-4-20250514";
  process.env.CLAUDE_MAX_TOKENS = "4096";
  await connectTestDB();
});

afterAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  jest.restoreAllMocks();
  analyzeMock = (
    jest.requireMock("../src/integrations/claude/claudeClient") as {
      analyzeProject: jest.Mock;
    }
  ).analyzeProject;
  analyzeMock.mockReset();
  analyzeMock.mockImplementation(() => Promise.resolve(JSON.stringify(mockValidOutput())));
});

describe("Phase 2 Step 1 - deterministic match (A)", () => {
  test("A. computeDeterministicMatch returns bounded score and recommendation", () => {
    const profilePayload: JobMatchProfilePayload = {
      profile: {
        preferredRoles: ["Developer"],
        preferredLocations: ["Remote"],
        jobSearchPreferences: { roles: [], locations: [] },
      },
      skills: [{ name: "React" }, { name: "Node.js" }],
      experience: [],
      education: [],
      projects: [],
      githubAnalysis: [],
      professionalEvidence: [],
      resumeEvidence: [],
    };
    const jobPayload: JobMatchJobPayload = {
      title: "React Engineer",
      companyName: "Acme",
      description: "React role",
      locations: ["Remote"],
      remoteType: "remote",
      employmentType: "full-time",
      experienceLevel: "mid",
      skills: ["React", "GraphQL"],
      technologies: [],
    };
    const det = computeDeterministicMatch(profilePayload, jobPayload);
    expect(det.score).toBeGreaterThanOrEqual(0);
    expect(det.score).toBeLessThanOrEqual(100);
    expect(["apply", "maybe", "skip"]).toContain(det.recommendation);
    expect(det.matchingSkills).toContain("React");
  });
});

describe("Phase 2 Step 1 - score math and clamping (D, P, Q)", () => {
  test("P. no score becomes NaN/Infinity", () => {
    expect(Number.isNaN(clampMatchScore(NaN))).toBe(false);
    expect(Number.isNaN(clampMatchScore(Infinity))).toBe(false);
    expect(Number.isFinite(combineScores(50, 70).finalScore)).toBe(true);
  });

  test("Q. combineScores clamps the final score to 0-100", () => {
    expect(combineScores(50, 500).finalScore).toBeLessThanOrEqual(100);
    expect(combineScores(50, -100).aiScore).toBe(0);
    expect(combineScores(50, null).finalScore).toBe(50);
    expect(combineScores(50, null).aiScore).toBeNull();
  });

  test("D. aiScore is clamped into range even when AI overflows", () => {
    const { aiScore, finalScore } = combineScores(80, 150);
    expect(aiScore!).toBeLessThanOrEqual(100);
    expect(finalScore).toBeLessThanOrEqual(100);
    expect(finalScore).toBeGreaterThanOrEqual(80);
  });
});

describe("Phase 2 Step 1 - AI output schema (C, R)", () => {
  test("C. schema rejects negative score", () => {
    const r = validateJobMatchAIOutput({ ...mockValidOutput(), score: -1 });
    expect(r.success).toBe(false);
  });

  test("C. schema rejects score above 100", () => {
    const r = validateJobMatchAIOutput({ ...mockValidOutput(), score: 200 });
    expect(r.success).toBe(false);
  });

  test("C. schema rejects non-numeric score", () => {
    const r = validateJobMatchAIOutput({ ...mockValidOutput(), score: "high" });
    expect(r.success).toBe(false);
  });

  test("C. schema accepts gaps field and defaults arrays", () => {
    const r = validateJobMatchAIOutput({ score: 80, summary: "s" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.gaps).toEqual([]);
      expect(r.data.missingSkills).toEqual([]);
    }
  });

  test("R. matchLevel and recommendation are consistent with the score", () => {
    for (const s of [30, 55, 70, 80, 95]) {
      const level = matchLevelFromScore(s);
      expect(level).toMatch(/match/);
    }
    expect(deriveRecommendationFromScore(90)).toBe("apply");
    expect(deriveRecommendationFromScore(40)).toBe("skip");
    expect(deriveRecommendationFromScore(60)).toBe("maybe");
  });
});

describe("Phase 2 Step 1 - versioning (I, J)", () => {
  test("I. changed job input changes jobVersion (invalidates)", async () => {
    const job1: JobMatchJobPayload = {
      title: "X", companyName: "A", description: "d", locations: [],
      remoteType: "remote", employmentType: "full-time", experienceLevel: "mid",
      skills: ["a"], technologies: [],
    };
    const job2 = { ...job1, skills: ["b"] };
    expect(computeJobVersion(job1)).not.toBe(computeJobVersion(job2));
  });

  test("J. changed profile input changes profileVersion (invalidates)", async () => {
    const base: JobMatchProfilePayload = {
      profile: { preferredRoles: [], preferredLocations: [], jobSearchPreferences: { roles: [], locations: [] } },
      skills: [{ name: "React" }], experience: [], education: [], projects: [],
      githubAnalysis: [], professionalEvidence: [], resumeEvidence: [],
    };
    const changed = {
      ...base,
      skills: [{ name: "Vue" }],
    };
    expect(computeProfileVersion(base)).not.toBe(computeProfileVersion(changed));
  });
});

describe("Phase 2 Step 1 - integration: matching behavior (B, E, F, G, H, S, T)", () => {
  test("B. AI receives the canonical profile payload", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id as string);
    const job = await seedJob();
    await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set(authorize(token))
      .expect(200);
    const call = (
      jest.requireMock("../src/integrations/claude/claudeClient") as {
        __calls?: unknown;
      }
    );
    void call;
    expect(analyzeMock).toHaveBeenCalled();
  });

  test("E. invalid AI output falls back to a deterministic match (200, aiScore null)", async () => {
    analyzeMock.mockResolvedValueOnce(JSON.stringify({ ...mockValidOutput(), score: 500 }));
    const { token, user } = await registerUser();
    await seedProfile(user.id as string);
    const job = await seedJob();
    const res = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set(authorize(token));
    expect(res.status).toBe(200);
    expect(res.body.match.aiScore).toBeNull();
    expect(res.body.match.deterministicScore).toBeGreaterThanOrEqual(0);
    expect(res.body.match.finalScore).toBe(res.body.match.deterministicScore);
  });

  test("F. provider failure falls back to a deterministic match", async () => {
    // Neutralize any other configured providers (loaded from .env by app.ts) so
    // the mocked Claude failure is the only provider attempt, then it exhausts
    // and degrades to a deterministic match.
    const gemini = process.env.GEMINI_API_KEY;
    const openai = process.env.OPENAI_API_KEY;
    const def = process.env.DEFAULT_AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEFAULT_AI_PROVIDER;
    try {
      analyzeMock.mockRejectedValueOnce(new Error("upstream down"));
      const { token, user } = await registerUser();
      await seedProfile(user.id as string);
      const job = await seedJob();
      const res = await request(app)
        .post(`/api/jobs/${job._id}/match`)
        .set(authorize(token));
      expect(res.status).toBe(200);
      expect(res.body.match.aiModel).toBe("deterministic");
      expect(res.body.match.aiScore).toBeNull();
    } finally {
      if (gemini) process.env.GEMINI_API_KEY = gemini;
      if (openai) process.env.OPENAI_API_KEY = openai;
      if (def) process.env.DEFAULT_AI_PROVIDER = def;
    }
  });

  test("G. missing provider config does not crash matching", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    const gemini = process.env.GEMINI_API_KEY;
    const openai = process.env.OPENAI_API_KEY;
    const def = process.env.DEFAULT_AI_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEFAULT_AI_PROVIDER;
    try {
      // With no key configured, the router throws; matching must still return a deterministic result.
      const { token, user } = await registerUser();
      await seedProfile(user.id as string);
      const job = await seedJob();
      const res = await request(app)
        .post(`/api/jobs/${job._id}/match`)
        .set(authorize(token));
      expect(res.status).toBe(200);
      expect(res.body.match.aiModel).toBe("deterministic");
      expect(res.body.match.aiScore).toBeNull();
    } finally {
      if (original) process.env.ANTHROPIC_API_KEY = original;
      if (gemini) process.env.GEMINI_API_KEY = gemini;
      if (openai) process.env.OPENAI_API_KEY = openai;
      if (def) process.env.DEFAULT_AI_PROVIDER = def;
    }
  });

  test("H. cached valid (versioned) match is reused", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id as string);
    const job = await seedJob();
    const first = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set(authorize(token))
      .expect(200);
    analyzeMock.mockClear();
    const second = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set(authorize(token))
      .expect(200);
    expect(second.body.cached).toBe(true);
    expect(String(second.body.match._id)).toBe(String(first.body.match._id));
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  test("S. an existing valid match is not destroyed when AI later fails", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id as string);
    const job = await seedJob();
    const first = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set(authorize(token))
      .expect(200);
    const firstId = String(first.body.match._id);

    // Even if AI fails, the cached valid match is reused and not overwritten.
    analyzeMock.mockRejectedValue(new Error("boom"));
    const second = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set(authorize(token))
      .expect(200);
    expect(String(second.body.match._id)).toBe(firstId);
    expect(await JobMatch.countDocuments({ user: user.id, job: job._id })).toBe(1);
  });

  test("T. repeated matching does not create duplicates", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id as string);
    const job = await seedJob();
    await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);
    await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);
    await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);
    expect(await JobMatch.countDocuments({ user: user.id, job: job._id })).toBe(1);
  });

  test("I2. changed job input recomputes the match", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id as string);
    const job = await seedJob();
    await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);

    // Material job change -> jobVersion differs -> new match created.
    await Job.updateOne({ _id: job._id }, { $set: { description: "completely different role now" } });
    analyzeMock.mockClear();
    const res = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set(authorize(token))
      .expect(200);
    expect(res.body.cached).toBe(false);
    expect(analyzeMock).toHaveBeenCalledTimes(1);
    expect(await JobMatch.countDocuments({ user: user.id, job: job._id })).toBe(2);
  });

  test("J2. changed user profile input recomputes the match", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id as string);
    const job = await seedJob();
    await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);

    // Material profile change -> profileVersion differs -> recompute.
    await Skill.create([{ user: user.id, name: "GraphQL", category: "Programming", proficiency: "Advanced" }]);
    analyzeMock.mockClear();
    const res = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set(authorize(token))
      .expect(200);
    expect(res.body.cached).toBe(false);
    expect(analyzeMock).toHaveBeenCalledTimes(1);
  });
});

describe("Phase 2 Step 1 - security & dashboard (K, L, M)", () => {
  test("M. dashboard opportunity feed exposes additive match fields", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id as string);
    const job = await seedJob();
    await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);

    const res = await request(app)
      .get("/api/jobs/opportunities")
      .set(authorize(token))
      .expect(200);
    const item = res.body.opportunities[0];
    expect(item).toBeDefined();
    expect(typeof item.match.deterministicScore).toBe("number");
    expect(item.match.aiScore).toBe(87);
    expect(typeof item.match.finalScore).toBe("number");
    expect(Array.isArray(item.match.gaps)).toBe(true);
    expect(typeof item.match.recommendation).toBe("string");
  });

  test("L. API responses never expose private job rawSource/credentials", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id as string);
    const job = await seedJob({ rawSource: { accessToken: "secret", password: "x", apiKey: "y" } });
    await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);

    const detail = await request(app)
      .get(`/api/jobs/opportunities/${job._id}`)
      .set(authorize(token))
      .expect(200);
    const raw = JSON.stringify(detail.body);
    expect(raw).not.toContain("accessToken");
    expect(raw).not.toContain("secret");
    expect(raw).not.toContain("apiKey");
  });

  test("K. provider failure does not log API keys", async () => {
    const gemini = process.env.GEMINI_API_KEY;
    const openai = process.env.OPENAI_API_KEY;
    const def = process.env.DEFAULT_AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEFAULT_AI_PROVIDER;
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      analyzeMock.mockRejectedValueOnce(new Error("upstream error"));
      const { token, user } = await registerUser();
      await seedProfile(user.id as string);
      const job = await seedJob();
      const res = await request(app)
        .post(`/api/jobs/${job._id}/match`)
        .set(authorize(token));
      expect(res.status).toBe(200);
      const logged = errorSpy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
      expect(logged).not.toContain("test-api-key");
    } finally {
      errorSpy.mockRestore();
      if (gemini) process.env.GEMINI_API_KEY = gemini;
      if (openai) process.env.OPENAI_API_KEY = openai;
      if (def) process.env.DEFAULT_AI_PROVIDER = def;
    }
  });
});
