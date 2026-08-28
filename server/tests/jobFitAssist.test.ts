import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import Job from "../src/models/Job";
import { Application } from "../src/models/Application";

jest.mock("../src/integrations/claude/claudeClient", () => {
  const analyze = jest.fn<Promise<string>, [string, string]>(() =>
    Promise.resolve("{}")
  );
  return {
    getModel: jest.fn(() => "claude-sonnet-4-20250514"),
    getMaxTokens: jest.fn(() => 4096),
    getReadmeLimit: jest.fn(() => 15000),
    truncateReadme: jest.fn((r: string) => ({ content: r || "", truncated: false })),
    resetClient: jest.fn(),
    analyzeProject: analyze,
    __getAnalyzeProject: () => analyze,
  };
});

const VALID_FIT = JSON.stringify({
  overallFit: "strong",
  summary: "Great match for this role.",
  highlights: ["Deep React experience"],
  gaps: ["No GraphQL in production"],
  uncertainties: ["Team size unknown"],
  suggestedQuestionsToAskEmployer: ["What is the stack?"],
});

const BASE_JOB = {
  source: "indeed",
  companyName: "Acme Corp",
  fingerprint: "fitfp",
  description: "A role description",
  locations: ["Remote"],
  location: "Remote",
  remoteType: "remote",
  employmentType: "full-time",
  experienceLevel: "mid",
  skills: ["react"],
  technologies: ["typescript"],
  jobUrl: "https://indeed.com/job/1",
  rawSource: {},
  metadata: {},
  lastSeenAt: new Date(),
  discoveredAt: new Date(),
  isActive: true,
};

const createJob = async (overrides: Record<string, unknown> = {}) => {
  const job = await Job.create({
    ...BASE_JOB,
    sourceJobId: `fit-${Math.random().toString(36).slice(2)}`,
    title: "React Developer",
    ...overrides,
  });
  return job;
};

const authorize = (token: string) => ({ Authorization: `Bearer ${token}` });

let analyzeMock: jest.Mock;

beforeAll(async () => {
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY = "c".repeat(64);
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "d".repeat(64);
  process.env.ANTHROPIC_API_KEY = "test-api-key";
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  jest.restoreAllMocks();
  analyzeMock = (
    jest.requireMock("../src/integrations/claude/claudeClient") as {
      __getAnalyzeProject: () => jest.Mock;
    }
  ).__getAnalyzeProject();
  analyzeMock.mockReset();
});

async function setup(token: string, overrides: Record<string, unknown> = {}) {
  const job = await createJob(overrides);
  const created = await request(app)
    .post("/api/applications")
    .set(authorize(token))
    .send({ jobId: String(job._id) });
  expect(created.status).toBe(201);
  return created.body.application;
}

describe("M16 job-fit assist (Claude advisory)", () => {
  test("fit-assist requires auth", async () => {
    const res = await request(app).post("/api/applications/abc/fit-assist");
    expect(res.status).toBe(401);
  });

  test("returns a validated advisory assessment and never changes status", async () => {
    analyzeMock.mockResolvedValueOnce(VALID_FIT);
    const { token } = await registerUser();
    const application = await setup(token);

    const res = await request(app)
      .post(`/api/applications/${application._id}/fit-assist`)
      .set(authorize(token));
    expect(res.status).toBe(200);
    expect(res.body.advisoryOnly).toBe(true);
    expect(res.body.statusUnchanged).toBe(true);
    expect(res.body.assessment.overallFit).toBe("strong");
    expect(res.body.assessment.summary).toContain("Great match");
    expect(res.body.assessment.highlights).toContain("Deep React experience");

    const fresh = await Application.findById(application._id);
    expect(fresh!.status).toBe("saved");
    expect(fresh!.appliedAt).toBeUndefined();
  });

  test("strict schema rejects unknown/extra fields (422)", async () => {
    analyzeMock.mockResolvedValueOnce(
      JSON.stringify({ ...JSON.parse(VALID_FIT), fabricatedCredential: "MIT PhD" })
    );
    const { token } = await registerUser();
    const application = await setup(token);

    const res = await request(app)
      .post(`/api/applications/${application._id}/fit-assist`)
      .set(authorize(token));
    expect(res.status).toBe(422);
  });

  test("malformed Claude output returns 422", async () => {
    analyzeMock.mockResolvedValueOnce(JSON.stringify({ summary: "" }));
    const { token } = await registerUser();
    const application = await setup(token);

    const res = await request(app)
      .post(`/api/applications/${application._id}/fit-assist`)
      .set(authorize(token));
    expect(res.status).toBe(422);
  });

  test("cross-user access returns 404", async () => {
    analyzeMock.mockResolvedValueOnce(VALID_FIT);
    const { token } = await registerUser();
    const { token: tokenB } = await registerSecondUser();
    const application = await setup(token);

    const res = await request(app)
      .post(`/api/applications/${application._id}/fit-assist`)
      .set(authorize(tokenB));
    expect(res.status).toBe(404);
  });

  test("invalid id returns 404", async () => {
    analyzeMock.mockResolvedValueOnce(VALID_FIT);
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/applications/not-an-objectid/fit-assist")
      .set(authorize(token));
    expect(res.status).toBe(404);
  });

  test("response never leaks sensitive metadata", async () => {
    analyzeMock.mockResolvedValueOnce(VALID_FIT);
    const { token } = await registerUser();
    const application = await setup(token);

    const res = await request(app)
      .post(`/api/applications/${application._id}/fit-assist`)
      .set(authorize(token));
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("accessToken");
    expect(raw).not.toContain("__v");
  });
});
