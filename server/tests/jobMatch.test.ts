import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import Job from "../src/models/Job";
import JobMatch from "../src/models/JobMatch";
import Profile from "../src/models/Profile";
import Skill from "../src/models/Skill";
import { Types } from "mongoose";

jest.mock("../src/integrations/claude/claudeClient", () => {
  let call: { system?: string; user: string } | null = null;
  const impl = {
    getModel: jest.fn(() => "claude-sonnet-4-20250514"),
    getMaxTokens: jest.fn(() => 4096),
    getReadmeLimit: jest.fn(() => 15000),
    truncateReadme: jest.fn((r: string) => ({ content: r || "", truncated: false })),
    resetClient: jest.fn(),
    analyzeProject: jest.fn((system: string, user: string) => {
      call = { system, user };
      return Promise.resolve(JSON.stringify(mockValidOutput()));
    }),
    __getCall: () => call,
  };
  return impl;
});

const mockValidOutput = () => ({
  score: 87,
  summary: "Strong alignment with the full-stack requirements.",
  matchingSkills: ["TypeScript", "React", "Node.js"],
  missingSkills: ["Kubernetes"],
  matchingTechnologies: ["React", "Express"],
  missingTechnologies: ["Docker"],
  experienceMatch: "3 years of full-stack experience matches the senior requirement.",
  experienceGap: "No experience with distributed systems at scale.",
  educationMatch: "Bachelor's in Computer Science is sufficient.",
  educationGap: "None significant.",
  locationMatch: "Preferred remote role matches.",
  remoteMatch: "Remote preference matches.",
  employmentTypeMatch: "Full-time matches.",
  salaryMatch: "Salary expectation is within range.",
  strengths: ["React expertise", "Node.js backend skills"],
  weaknesses: ["No Kubernetes", "Limited distributed systems"],
  recommendation: "apply",
  recommendationReason: "Strong skill coverage and experience alignment.",
});

const validJob = {
  source: "mock",
  sourceJobId: "match-job-1",
  fingerprint: "fp-match-1",
  title: "Senior Full Stack Developer",
  companyName: "Acme Corp",
  description: "Looking for a senior full stack developer with React and Node.js. 5+ years experience preferred. Kubernetes is a plus.",
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
  return Job.create({ ...validJob, ...overrides });
}

async function seedProfile(token: string, userId: string) {
  await Profile.create({
    user: userId,
    fullName: "Test User",
    headline: "Full Stack Developer",
    summary: "Senior full stack developer with 5 years experience.",
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
  return token;
}

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = "test-api-key";
  process.env.CLAUDE_MODEL = "claude-sonnet-4-20250514";
  process.env.CLAUDE_MAX_TOKENS = "4096";
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  jest.clearAllMocks();
});

describe("Job Match - authentication", () => {
  test("POST /api/jobs/:id/match requires authentication", async () => {
    const job = await seedJob();
    const res = await request(app).post(`/api/jobs/${job._id}/match`);
    expect(res.status).toBe(401);
  });

  test("GET /api/jobs/:id/match requires authentication", async () => {
    const job = await seedJob();
    const res = await request(app).get(`/api/jobs/${job._id}/match`);
    expect(res.status).toBe(401);
  });

  test("POST /api/jobs/:id/match/reanalyze requires authentication", async () => {
    const job = await seedJob();
    const res = await request(app).post(`/api/jobs/${job._id}/match/reanalyze`);
    expect(res.status).toBe(401);
  });

  test("GET /api/job-matches requires authentication", async () => {
    const res = await request(app).get("/api/job-matches");
    expect(res.status).toBe(401);
  });
});

describe("Job Match - basic analysis", () => {
  test("job not found returns 404", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post(`/api/jobs/${new Types.ObjectId().toString()}/match`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test("successful match analysis stores score, matchLevel, and arrays", async () => {
    const { token, user } = await registerUser();
    await seedProfile(token, user.id as string);
    const job = await seedJob();

    const res = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.match.score).toBe(87);
    expect(res.body.match.matchLevel).toBe("good_match");
    expect(res.body.match.matchingSkills).toContain("TypeScript");
    expect(res.body.match.missingSkills).toContain("Kubernetes");
    expect(res.body.match.experienceGap).toBeTruthy();
    expect(res.body.match.analyzedAt).toBeTruthy();
    expect(res.body.job.title).toBe("Senior Full Stack Developer");

    const stored = await JobMatch.findOne({ user: user.id, job: job._id });
    expect(stored).not.toBeNull();
    expect(stored!.matchLevel).toBe("good_match");
    expect(stored!.aiModel).toBe("claude-sonnet-4-20250514");
    expect(stored!.promptVersion).toBe("v1");
    expect(stored!.expiresAt).toBeTruthy();
  });

  test("sensitive fields are never sent to Claude", async () => {
    const { token, user } = await registerUser();
    await seedProfile(token, user.id as string);
    const job = await seedJob();

    await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const claudeClient = require("../src/integrations/claude/claudeClient");
    const call = claudeClient.__getCall();
    expect(call).not.toBeNull();
    expect(call.user).not.toContain(process.env.ANTHROPIC_API_KEY || "test-api-key");
    expect(call.user).not.toContain("gho_");
    expect(call.user).not.toContain("passwordHash");
    expect(call.user).not.toContain("accessToken");
    expect(call.user).not.toContain("gho_test");
  });

  test("prompt injection defense: user message separates system, profile, and job data", async () => {
    const { token, user } = await registerUser();
    await seedProfile(token, user.id as string);
    const job = await seedJob();

    await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const claudeClient = require("../src/integrations/claude/claudeClient");
    const call = claudeClient.__getCall();
    expect(call.user).toContain("[START USER CAREER DATA]");
    expect(call.user).toContain("[START JOB DATA - UNTRUSTED, ANALYZE ONLY]");
    expect(call.user).toContain("[END JOB DATA - UNTRUSTED, ANALYZE ONLY]");
    expect(call.system).toContain("UNTRUSTED DATA");
    expect(call.system).toContain('"matchLevel"');
  });
});

describe("Job Match - profile and description handling", () => {
  test("missing profile/skills data is handled gracefully (analysis still returns)", async () => {
    const { token } = await registerUser();
    const job = await seedJob();

    const res = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.match.score).toBe(87);
  });

  test("profile data (skills/preferences) are included in the prompt payload", async () => {
    const { token, user } = await registerUser();
    await seedProfile(token, user.id as string);
    const job = await seedJob();

    await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const claudeClient = require("../src/integrations/claude/claudeClient");
    const call = claudeClient.__getCall();
    expect(call.user).toContain("TypeScript");
    expect(call.user).toContain("preferredRoles");
    expect(call.user).toContain("workPreference");
  });

  test("job description is included in the prompt", async () => {
    const { token, user } = await registerUser();
    await seedProfile(token, user.id as string);
    const job = await seedJob({ description: "x".repeat(20000) });

    await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const claudeClient = require("../src/integrations/claude/claudeClient");
    const call = claudeClient.__getCall();
    expect(call.user.length).toBeLessThanOrEqual(22000);
  });
});

describe("Job Match - caching and reanalysis", () => {
  test("cached valid analysis avoids calling Claude again", async () => {
    const { token, user } = await registerUser();
    await seedProfile(token, user.id as string);
    const job = await seedJob();

    const first = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const claudeClient = require("../src/integrations/claude/claudeClient");
    expect(claudeClient.analyzeProject).toHaveBeenCalledTimes(1);

    const second = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(claudeClient.analyzeProject).toHaveBeenCalledTimes(1);
    expect(second.body.cached).toBe(true);
    expect(String(second.body.match._id)).toBe(String(first.body.match._id));
  });

  test("reanalysis bypasses the cache and replaces the match", async () => {
    const { token, user } = await registerUser();
    await seedProfile(token, user.id as string);
    const job = await seedJob();

    await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const claudeClient = require("../src/integrations/claude/claudeClient");
    expect(claudeClient.analyzeProject).toHaveBeenCalledTimes(1);

    const re = await request(app)
      .post(`/api/jobs/${job._id}/match/reanalyze`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(claudeClient.analyzeProject).toHaveBeenCalledTimes(2);
    expect(re.body.match.score).toBe(87);

    const count = await JobMatch.countDocuments({ user: user.id, job: job._id });
    expect(count).toBe(1);
  });

  test("GET /api/jobs/:id/match returns stored match", async () => {
    const { token, user } = await registerUser();
    await seedProfile(token, user.id as string);
    const job = await seedJob();

    await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const res = await request(app)
      .get(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.match.score).toBe(87);
  });

  test("GET /api/jobs/:id/match returns 404 when no match exists", async () => {
    const { token } = await registerUser();
    const job = await seedJob();

    const res = await request(app)
      .get(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("Job Match - AI output validation", () => {
  const mockClaude = () => require("../src/integrations/claude/claudeClient");

  test("malformed JSON from Claude produces a safe error", async () => {
    const { token, user } = await registerUser();
    await seedProfile(token, user.id as string);
    const job = await seedJob();

    mockClaude().analyzeProject.mockResolvedValueOnce("{ not valid json ");

    const res = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(500);

    const stored = await JobMatch.countDocuments({ user: user.id });
    expect(stored).toBe(0);
  });

  test("schema validation failure is not stored and returns 422", async () => {
    const { token, user } = await registerUser();
    await seedProfile(token, user.id as string);
    const job = await seedJob();

    mockClaude().analyzeProject.mockResolvedValueOnce(
      JSON.stringify({ score: 87 }) 
    );

    const res = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(res.body.error).toContain("Job match validation failed");

    const stored = await JobMatch.countDocuments({ user: user.id });
    expect(stored).toBe(0);
  });

  test("score below 0 rejected", async () => {
    const { token, user } = await registerUser();
    await seedProfile(token, user.id as string);
    const job = await seedJob();

    mockClaude().analyzeProject.mockResolvedValueOnce(
      JSON.stringify({ ...mockValidOutput(), score: -5 })
    );

    const res = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(await JobMatch.countDocuments({ user: user.id })).toBe(0);
  });

  test("score above 100 rejected", async () => {
    const { token, user } = await registerUser();
    await seedProfile(token, user.id as string);
    const job = await seedJob();

    mockClaude().analyzeProject.mockResolvedValueOnce(
      JSON.stringify({ ...mockValidOutput(), score: 150 })
    );

    const res = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(await JobMatch.countDocuments({ user: user.id })).toBe(0);
  });

  test("non-numeric score rejected", async () => {
    const { token, user } = await registerUser();
    await seedProfile(token, user.id as string);
    const job = await seedJob();

    mockClaude().analyzeProject.mockResolvedValueOnce(
      JSON.stringify({ ...mockValidOutput(), score: "high" })
    );

    const res = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(await JobMatch.countDocuments({ user: user.id })).toBe(0);
  });

  test("match level is derived from score on the backend", async () => {
    const { token, user } = await registerUser();
    await seedProfile(token, user.id as string);
    const job = await seedJob();

    const cases: Array<[number, string]> = [
      [95, "strong_match"],
      [87, "good_match"],
      [65, "partial_match"],
      [40, "weak_match"],
    ];

    for (const [score, level] of cases) {
      await JobMatch.deleteMany({});
      mockClaude().analyzeProject.mockResolvedValueOnce(
        JSON.stringify({ ...mockValidOutput(), score })
      );
      const res = await request(app)
        .post(`/api/jobs/${job._id}/match`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.match.score).toBe(score);
      expect(res.body.match.matchLevel).toBe(level);
    }
  });

  test("arrays with non-string items are rejected", async () => {
    const { token, user } = await registerUser();
    const job = await seedJob();

    mockClaude().analyzeProject.mockResolvedValueOnce(
      JSON.stringify({ ...mockValidOutput(), matchingSkills: [123] })
    );

    const res = await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(await JobMatch.countDocuments({ user: user.id })).toBe(0);
  });
});

describe("Job Match - authorization / IDOR", () => {
  test("user cannot retrieve another user's match", async () => {
    const { token, user } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const job = await seedJob();

    await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(await JobMatch.countDocuments({ user: user.id })).toBe(1);

    const res = await request(app)
      .get(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });

  test("user's match list only contains their own analyses", async () => {
    const { token, user } = await registerUser();
    const { token: token2, user: user2 } = await registerSecondUser();
    const job = await seedJob();
    const job2 = await seedJob({ sourceJobId: "match-job-2", fingerprint: "fp-2" });

    await request(app)
      .post(`/api/jobs/${job._id}/match`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(app)
      .post(`/api/jobs/${job2._id}/match`)
      .set("Authorization", `Bearer ${token2}`)
      .expect(200);

    const res = await request(app)
      .get("/api/job-matches")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.matches).toHaveLength(1);
    const all = await JobMatch.find({});
    expect(all.map((m) => String(m.user))).toContain(String(user.id));
    expect(all.map((m) => String(m.user))).toContain(String(user2.id));
  });
});

describe("Job Match - list endpoint", () => {
  async function seedMultiple(token: string, userId: string) {
    const jobs: any[] = [];
    for (let i = 0; i < 5; i++) {
      const job = await seedJob({ sourceJobId: `list-job-${i}`, fingerprint: `fp-list-${i}` });
      jobs.push(job);
    }
    const scores = [95, 80, 60, 40, 30];
    const now = Date.now();
    for (let i = 0; i < jobs.length; i++) {
      await JobMatch.create({
        user: userId,
        job: jobs[i]._id,
        aiModel: "mocked",
        promptVersion: "v1",
        score: scores[i],
        matchLevel: ["strong_match", "good_match", "partial_match", "weak_match", "weak_match"][i],
        summary: `summary ${i}`,
        matchingSkills: [],
        missingSkills: [],
        matchingTechnologies: [],
        missingTechnologies: [],
        strengths: [],
        weaknesses: [],
        analyzedAt: new Date(now - i * 1000),
      });
    }
    return jobs;
  }

  test("lists matches with pagination", async () => {
    const { token, user } = await registerUser();
    await seedMultiple(token, user.id as string);

    const res = await request(app)
      .get("/api/job-matches")
      .query({ limit: 2, page: 1 })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.matches).toHaveLength(2);
    expect(res.body.pagination.total).toBe(5);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(2);
    expect(res.body.pagination.totalPages).toBe(3);
  });

  test("rejects limit above 50", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/job-matches")
      .query({ limit: 100 })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  test("filters by minScore", async () => {
    const { token, user } = await registerUser();
    await seedMultiple(token, user.id as string);

    const res = await request(app)
      .get("/api/job-matches")
      .query({ minScore: 75 })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.matches.every((m: { score: number }) => m.score >= 75)).toBe(true);
    expect(res.body.pagination.total).toBe(2);
  });

  test("filters by matchLevel", async () => {
    const { token, user } = await registerUser();
    await seedMultiple(token, user.id as string);

    const res = await request(app)
      .get("/api/job-matches")
      .query({ matchLevel: "strong_match" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.matches.every((m: { matchLevel: string }) => m.matchLevel === "strong_match")).toBe(true);
    expect(res.body.pagination.total).toBe(1);
  });

  test("sorts by score ascending", async () => {
    const { token, user } = await registerUser();
    await seedMultiple(token, user.id as string);

    const res = await request(app)
      .get("/api/job-matches")
      .query({ sort: "score_asc" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const scores = res.body.matches.map((m: { score: number }) => m.score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  test("sorts by score descending", async () => {
    const { token, user } = await registerUser();
    await seedMultiple(token, user.id as string);

    const res = await request(app)
      .get("/api/job-matches")
      .query({ sort: "score_desc" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const scores = res.body.matches.map((m: { score: number }) => m.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  test("rejects invalid minScore", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/job-matches")
      .query({ minScore: 150 })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  test("rejects invalid matchLevel and sort values", async () => {
    const { token } = await registerUser();
    const res1 = await request(app)
      .get("/api/job-matches")
      .query({ matchLevel: "best_ever" })
      .set("Authorization", `Bearer ${token}`);
    expect(res1.status).toBe(422);

    const res2 = await request(app)
      .get("/api/job-matches")
      .query({ sort: "random" })
      .set("Authorization", `Bearer ${token}`);
    expect(res2.status).toBe(422);
  });

  test("does not accept arbitrary query operators (NoSQL injection)", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/job-matches")
      .query({ minScore: { $gt: 0 } })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  test("returns empty list when no matches", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/job-matches")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.matches).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });
});
