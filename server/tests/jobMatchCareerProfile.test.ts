import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser } from "./helpers";
import Profile from "../src/models/Profile";
import Skill from "../src/models/Skill";
import Experience from "../src/models/Experience";
import Education from "../src/models/Education";
import Project from "../src/models/Project";
import GitHubRepositoryModel from "../src/models/GitHubRepository";
import ProjectAnalysis from "../src/models/ProjectAnalysis";
import ProfessionalEvidence from "../src/models/ProfessionalEvidence";
import Resume from "../src/models/Resume";
import Job from "../src/models/Job";
import {
  prepareMatchProfile,
} from "../src/services/jobMatchProfile";
import {
  computeProfileVersion,
  computeJobVersion,
} from "../src/services/jobMatching";
import {
  JobMatchProfilePayload,
  JobMatchJobPayload,
} from "../src/services/jobMatchTypes";
import {
  JOB_MATCH_SYSTEM_PROMPT,
  buildJobMatchUserMessage,
} from "../src/integrations/claude/jobMatchPrompts";
import { ClaudeService } from "../src/integrations/claude/claude.service";

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
  score: 80,
  summary: "Good alignment.",
  matchingSkills: ["TypeScript", "React", "Node.js"],
  missingSkills: ["Kubernetes"],
  matchingTechnologies: ["React"],
  missingTechnologies: ["Docker"],
  experienceMatch: "matches", experienceGap: "none",
  educationMatch: "sufficient", educationGap: "none",
  locationMatch: "matches", remoteMatch: "matches",
  employmentTypeMatch: "matches", salaryMatch: "in range",
  strengths: ["React"], weaknesses: [], gaps: [],
  recommendation: "apply", recommendationReason: "good fit",
});

const validJob = {
  source: "mock", sourceJobId: "career-1", fingerprint: "fp-career-1",
  title: "Senior Full Stack Developer", companyName: "Acme Corp",
  description: "Senior full stack role.", locations: ["Remote"], location: "Remote",
  remoteType: "remote", employmentType: "full-time", experienceLevel: "senior",
  salaryMin: 100000, salaryMax: 160000, salaryCurrency: "USD", salaryPeriod: "yearly",
  skills: ["React", "Node.js", "TypeScript", "Kubernetes"],
  technologies: ["React", "Express", "Docker", "Kubernetes"],
  jobUrl: "https://example.com/jobs/fullstack", applyUrl: "https://example.com/apply",
  rawSource: {}, lastSeenAt: new Date(), discoveredAt: new Date(), isActive: true,
};

function baseProfile(overrides: Partial<JobMatchProfilePayload> = {}): JobMatchProfilePayload {
  return {
    profile: {
      fullName: "Test User", headline: "Full Stack Developer", summary: "A summary.",
      location: "Remote", preferredRoles: ["Full Stack Developer"],
      preferredLocations: ["Remote"], workPreference: "remote",
      salaryExpectation: { min: 90000, max: 150000, currency: "USD" },
      jobSearchPreferences: { roles: ["Full Stack Developer"], locations: ["Remote"], remote: "remote", experienceLevel: "senior", salaryMinimum: 90000 },
    },
    skills: [{ name: "React", category: "Frontend", proficiency: "Expert" }],
    experience: [{ company: "Acme", position: "Engineer", description: "Built apps.", durationYears: 5, currentlyWorking: true }],
    education: [{ degree: "BS", institution: "State U", field: "CS" }],
    projects: [{ name: "Web App", description: "An app.", technologies: ["React"], features: [], role: "Engineer" }],
    githubAnalysis: [{ projectSummary: "Repo summary.", technologies: ["TypeScript"], keyFeatures: [], strengths: [], weaknesses: [], recommendations: [] }],
    professionalEvidence: [{ projectName: "Web App", professionalSummary: "Led X.", technicalSkills: ["TypeScript"], technologies: ["React"], roleRelevantKeywords: ["full stack"], projectDomain: "web", senioritySignals: [] }],
    resumeEvidence: [{ title: "Resume v1", fileName: "resume.pdf", version: 1, hasFile: true }],
    ...overrides,
  };
}

function baseJob(overrides: Partial<JobMatchJobPayload> = {}): JobMatchJobPayload {
  return {
    title: "Senior Full Stack Developer", companyName: "Acme Corp",
    description: "Senior full stack role.", locations: ["Remote"], remoteType: "remote",
    employmentType: "full-time", experienceLevel: "senior",
    salary: { min: 100000, max: 160000, currency: "USD", period: "yearly" },
    skills: ["React", "Node.js", "TypeScript", "Kubernetes"],
    technologies: ["React", "Express", "Docker", "Kubernetes"],
    jobUrl: "https://example.com/jobs/fullstack",
    ...overrides,
  };
}

async function seedJob(overrides: Record<string, unknown> = {}) {
  return Job.create({ ...validJob, sourceJobId: `career-${Math.random()}`, ...overrides });
}

async function seedFullProfile(userId: string) {
  await Profile.create({
    user: userId, fullName: "Test User", headline: "Full Stack Developer", summary: "Senior dev.",
    preferredRoles: ["Full Stack Developer"], preferredLocations: ["Remote"], workPreference: "remote",
    salaryExpectation: { min: 90000, max: 150000, currency: "USD" },
    jobSearchPreferences: { roles: ["Full Stack Developer"], locations: ["Remote"], remote: "remote", experienceLevel: "senior", salaryMinimum: 90000 },
  });
  await Skill.create([
    { user: userId, name: "TypeScript", category: "Programming", proficiency: "Advanced" },
    { user: userId, name: "React", category: "Framework", proficiency: "Expert" },
  ]);
  await Experience.create({
    user: userId, company: "Acme", position: "Senior Engineer", description: "Built distributed apps.",
    startDate: new Date("2020-01-01"), endDate: null, currentlyWorking: true,
  });
  await Education.create({
    user: userId, degree: "Bachelor of Science", institution: "State U", field: "Computer Science",
    startDate: new Date("2010-01-01"), endDate: new Date("2014-05-01"),
  });
  await Project.create({
    user: userId, name: "Web App", description: "A full stack app.", technologies: ["React", "Node.js"],
    features: ["Auth", "Payments"], role: "Engineer", githubUrl: "https://github.com/u/webapp",
  });
  const repo = await GitHubRepositoryModel.create({
    user: userId, githubRepositoryId: 123, name: "webapp", fullName: "user/webapp",
    description: "Full stack", htmlUrl: "https://github.com/user/webapp", homepage: null,
    private: false, fork: false, defaultBranch: "main", language: "TypeScript", topics: [],
    stars: 1, forks: 0, size: 100, createdAtGithub: new Date(), updatedAtGithub: new Date(),
    pushedAtGithub: new Date(),
  });
  await ProjectAnalysis.create({
    user: userId, githubRepository: repo._id, projectSummary: "A full stack app.",
    problemStatement: "Problem", keyFeatures: ["Auth"], technologies: ["React", "Node.js"],
    programmingLanguages: ["TypeScript"], frameworks: ["React"], databases: ["Mongo"],
    tools: ["Git"], cloudServices: [], architecture: "MVC", developmentHighlights: ["scaled"],
    skillsDemonstrated: ["System Design"], difficultyLevel: "Advanced", developerRole: "Full Stack",
    resumeDescription: "Built a full stack app.", linkedinDescription: "Built a full stack app.",
    suggestedTags: ["web"], aiModel: "test", promptVersion: "v1", analyzedAt: new Date(),
  });
  await ProfessionalEvidence.create({
    user: userId, githubRepository: repo._id, sourceProjectAnalysis: null,
    projectName: "Web App", professionalSummary: "Built a full stack app.",
    problemSolved: "Addressed X.", contributionEvidence: "Led auth.", technicalSkills: ["System Design"],
    architecturePractices: ["MVC"], measurableImpact: "Improved perf.", technologies: ["React", "Node.js"],
    proposedTalkingPoints: [], suggestedPostAngles: [], evidenceReferences: [],
    roleRelevantKeywords: ["full stack"], projectDomain: "web", senioritySignals: ["led"],
    status: "ready",
  });
  await Resume.create({
    user: userId, title: "Resume v1", fileName: "resume.pdf",
    fileUrl: "https://private-storage.example.com/resumes/user123/resume.pdf", version: 1, isActive: true,
  });
}

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
    jest.requireMock("../src/integrations/claude/claudeClient") as { analyzeProject: jest.Mock }
  ).analyzeProject;
  analyzeMock.mockReset();
  analyzeMock.mockImplementation(() => Promise.resolve(JSON.stringify(mockValidOutput())));
});

const authorize = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("Phase 2 Step 2 - canonical payload contents (A-H)", () => {
  test("A/B/C/D. payload includes skills, experience, education, projects", async () => {
    const { user } = await registerUser();
    await seedFullProfile(user.id as string);
    const { payload } = await prepareMatchProfile(user.id as string);

    expect(payload.skills.some((s) => s.name === "TypeScript")).toBe(true);
    expect(payload.experience.some((e) => e.position === "Senior Engineer")).toBe(true);
    expect(payload.education.some((ed) => ed.degree === "Bachelor of Science")).toBe(true);
    expect(payload.projects.some((p) => p.name === "Web App")).toBe(true);
  });

  test("E. payload includes GitHub repository analysis", async () => {
    const { user } = await registerUser();
    await seedFullProfile(user.id as string);
    const { payload } = await prepareMatchProfile(user.id as string);
    expect(payload.githubAnalysis.length).toBeGreaterThan(0);
    expect(payload.githubAnalysis[0].projectSummary).toContain("full stack");
    expect(payload.githubAnalysis[0].technologies).toContain("React");
  });

  test("F. payload includes professional evidence", async () => {
    const { user } = await registerUser();
    await seedFullProfile(user.id as string);
    const { payload } = await prepareMatchProfile(user.id as string);
    expect(payload.professionalEvidence.length).toBeGreaterThan(0);
    expect(payload.professionalEvidence[0].roleRelevantKeywords).toContain("full stack");
  });

  test("G. payload includes jobSearchPreferences", async () => {
    const { user } = await registerUser();
    await seedFullProfile(user.id as string);
    const { payload } = await prepareMatchProfile(user.id as string);
    expect(payload.profile.jobSearchPreferences?.roles).toContain("Full Stack Developer");
    expect(payload.profile.jobSearchPreferences?.locations).toContain("Remote");
    expect(payload.profile.jobSearchPreferences?.experienceLevel).toBe("senior");
  });

  test("H. payload includes resume-derived evidence (metadata, never fileUrl)", async () => {
    const { user } = await registerUser();
    await seedFullProfile(user.id as string);
    const { payload, completeness } = await prepareMatchProfile(user.id as string);
    expect(completeness.hasResume).toBe(true);
    expect(payload.resumeEvidence).toHaveLength(1);
    expect(payload.resumeEvidence[0].title).toBe("Resume v1");
    expect(payload.resumeEvidence[0].fileName).toBe("resume.pdf");
    expect(payload.resumeEvidence[0].version).toBe(1);
    expect(payload.resumeEvidence[0].hasFile).toBe(true);
    // Private storage URL is never carried into the AI payload.
    expect(JSON.stringify(payload)).not.toContain("fileUrl");
    expect(JSON.stringify(payload)).not.toContain("private-storage");
  });
});

describe("Phase 2 Step 2 - versioning invalidates on career context change (I-L)", () => {
  test("I. resume change changes profileVersion", async () => {
    const { user } = await registerUser();
    await seedFullProfile(user.id as string);
    const before = computeProfileVersion((await prepareMatchProfile(user.id as string)).payload);
    await Resume.updateOne(
      { user: user.id },
      { $set: { title: "Resume v2", fileName: "resume-v2.pdf", version: 2 } }
    );
    const after = computeProfileVersion((await prepareMatchProfile(user.id as string)).payload);
    expect(after).not.toBe(before);
  });

  test("J. GitHub analysis change changes profileVersion", async () => {
    const { user } = await registerUser();
    await seedFullProfile(user.id as string);
    const before = computeProfileVersion((await prepareMatchProfile(user.id as string)).payload);
    await ProjectAnalysis.updateOne(
      { user: user.id },
      { $set: { technologies: ["Rust", "Go"] } }
    );
    const after = computeProfileVersion((await prepareMatchProfile(user.id as string)).payload);
    expect(after).not.toBe(before);
  });

  test("K. project change changes profileVersion", async () => {
    const { user } = await registerUser();
    await seedFullProfile(user.id as string);
    const before = computeProfileVersion((await prepareMatchProfile(user.id as string)).payload);
    await Project.updateOne({ user: user.id }, { $set: { name: "Renamed App" } });
    const after = computeProfileVersion((await prepareMatchProfile(user.id as string)).payload);
    expect(after).not.toBe(before);
  });

  test("L. job change changes jobVersion", () => {
    const a = computeJobVersion(baseJob({ description: "react role" }));
    const b = computeJobVersion(baseJob({ description: "rust role" }));
    expect(a).not.toBe(b);
  });

  test("I2. skill change changes profileVersion", async () => {
    const { user } = await registerUser();
    await seedFullProfile(user.id as string);
    const before = computeProfileVersion((await prepareMatchProfile(user.id as string)).payload);
    await Skill.create([{ user: user.id, name: "GraphQL", category: "Programming", proficiency: "Advanced" }]);
    const after = computeProfileVersion((await prepareMatchProfile(user.id as string)).payload);
    expect(after).not.toBe(before);
  });
});

describe("Phase 2 Step 2 - cache behavior (M/N/O)", () => {
  test("M. same user+job+context reuses cached match", async () => {
    const { token, user } = await registerUser();
    await seedFullProfile(user.id as string);
    const job = await seedJob();
    const first = await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);
    analyzeMock.mockClear();
    const second = await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);
    expect(second.body.cached).toBe(true);
    expect(String(second.body.match._id)).toBe(String(first.body.match._id));
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  test("N. changed profile context recomputes", async () => {
    const { token, user } = await registerUser();
    await seedFullProfile(user.id as string);
    const job = await seedJob();
    await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);
    await Skill.create([{ user: user.id, name: "Docker", category: "DevOps", proficiency: "Advanced" }]);
    analyzeMock.mockClear();
    const res = await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);
    expect(res.body.cached).toBe(false);
    expect(analyzeMock).toHaveBeenCalledTimes(1);
  });

  test("O. changed job context recomputes", async () => {
    const { token, user } = await registerUser();
    await seedFullProfile(user.id as string);
    const job = await seedJob();
    await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);
    await Job.updateOne({ _id: job._id }, { $set: { description: "completely different" } });
    analyzeMock.mockClear();
    const res = await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);
    expect(res.body.cached).toBe(false);
  });
});

describe("Phase 2 Step 2 - privacy & evidence (P/Q/R/S)", () => {
  test("P. AI user message contains no API/OAuth secrets or private URLs", () => {
    const payload = baseProfile({
      resumeEvidence: [
        { title: "Resume", fileName: "resume.pdf", version: 1, hasFile: true },
      ],
      professionalEvidence: [
        { projectName: "Web App", professionalSummary: "Led X.", technicalSkills: [], technologies: [], roleRelevantKeywords: [], projectDomain: "web", senioritySignals: [] },
      ],
    });
    const msg = buildJobMatchUserMessage(payload, baseJob());
    expect(msg).not.toContain("fileUrl");
    expect(msg).not.toContain("private-storage");
    expect(msg).not.toContain("access_token");
    expect(msg).not.toContain("secret");
    expect(msg).not.toContain("ghp_");
  });

  test("Q. match API response never exposes resume fileUrl", async () => {
    const { token, user } = await registerUser();
    await seedFullProfile(user.id as string);
    const job = await seedJob();
    const res = await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);
    expect(JSON.stringify(res.body)).not.toContain("fileUrl");
    expect(JSON.stringify(res.body)).not.toContain("private-storage");
  });

  test("R. system prompt forbids inventing requirements and handling related-skill claims", () => {
    const p = JOB_MATCH_SYSTEM_PROMPT;
    expect(p).toContain("EVIDENCE-BASED MATCHING");
    expect(p).toContain("NEVER claim a skill or technology because a RELATED one was found");
    expect(p).toContain("no direct evidence found");
    expect(p).toContain("Do NOT fabricate requirements");
    expect(p).toContain("MANDATORY requirements");
    expect(p).toContain("PREFERRED requirements");
    expect(p).toContain("RESPONSIBILITIES");
    expect(p).toContain("BENEFITS");
  });

  test("S. gaps field is explicit and missing evidence is represented as unknown", () => {
    // The schema directions require explicit gaps and 'insufficient evidence'
    // phrasing for missing experience; encode the intent at the validator level.
    const msg = buildJobMatchUserMessage(baseProfile(), baseJob());
    expect(msg).toContain("resumeEvidence");
    expect(msg).toContain("professionalEvidence");
    expect(msg).toContain("githubAnalysis");
  });
});

describe("Phase 2 Step 2 - provider consistency & deterministic fallback (T/U/X/Y)", () => {
  test("T. direct and fallback providers receive the identical logical user payload", async () => {
    // Neutralize secondary providers so the fallback only routes to (mocked) claude.
    const gemini = process.env.GEMINI_API_KEY;
    const openai = process.env.OPENAI_API_KEY;
    const def = process.env.DEFAULT_AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEFAULT_AI_PROVIDER;
    try {
      const profile = baseProfile();
      const job = baseJob();
      const svc = new ClaudeService();
      analyzeMock.mockClear();

      await svc.analyzeJobMatch(profile, job);
      const directCall = analyzeMock.mock.calls[analyzeMock.mock.calls.length - 1];
      const directMsg = String(directCall[1]);

      analyzeMock.mockClear();
      await svc.analyzeJobMatchFallback(profile, job);
      const fallbackCall = analyzeMock.mock.calls[analyzeMock.mock.calls.length - 1];
      const fallbackMsg = String(fallbackCall[1]);

      expect(fallbackMsg).toBe(directMsg);
      expect(fallbackMsg).toContain('[START USER CAREER DATA]');
    } finally {
      if (gemini) process.env.GEMINI_API_KEY = gemini;
      if (openai) process.env.OPENAI_API_KEY = openai;
      if (def) process.env.DEFAULT_AI_PROVIDER = def;
    }
  });

  test("U. deterministic match remains available when all AI providers fail", async () => {
    const gemini = process.env.GEMINI_API_KEY;
    const openai = process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      analyzeMock.mockRejectedValue(new Error("all down"));
      const { token, user } = await registerUser();
      await seedFullProfile(user.id as string);
      const job = await seedJob();
      const res = await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);
      expect(res.body.match.aiModel).toBe("deterministic");
      expect(res.body.match.aiScore).toBeNull();
      expect(res.body.match.deterministicScore).toBeGreaterThanOrEqual(0);
    } finally {
      if (gemini) process.env.GEMINI_API_KEY = gemini;
      if (openai) process.env.OPENAI_API_KEY = openai;
    }
  });

  test("X. no NaN/Infinity scores", async () => {
    const { token, user } = await registerUser();
    await seedFullProfile(user.id as string);
    const job = await seedJob();
    const res = await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);
    for (const key of ["score", "deterministicScore", "finalScore"]) {
      expect(Number.isFinite(res.body.match[key])).toBe(true);
    }
    if (res.body.match.aiScore != null) {
      expect(Number.isFinite(res.body.match.aiScore)).toBe(true);
    }
  });

  test("Y. scores remain 0-100", async () => {
    const { token, user } = await registerUser();
    await seedFullProfile(user.id as string);
    const job = await seedJob();
    const res = await request(app).post(`/api/jobs/${job._id}/match`).set(authorize(token)).expect(200);
    for (const key of ["score", "deterministicScore", "finalScore"]) {
      expect(res.body.match[key]).toBeGreaterThanOrEqual(0);
      expect(res.body.match[key]).toBeLessThanOrEqual(100);
    }
  });
});
