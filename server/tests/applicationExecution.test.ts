import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import Job from "../src/models/Job";
import { Application } from "../src/models/Application";
import { classifyApplyCapability } from "../src/services/applyCapability";

const mockJobBase = {
  source: "mock",
  companyName: "Acme Corp",
  fingerprint: "m16fp",
  description: "A test job",
  locations: ["Remote"],
  location: "Remote",
  remoteType: "remote",
  employmentType: "full-time",
  experienceLevel: "mid",
  skills: [],
  technologies: [],
  rawSource: {},
  metadata: {},
  lastSeenAt: new Date(),
  discoveredAt: new Date(),
  isActive: true,
};

const createJob = async (overrides: Record<string, unknown> = {}) => {
  const job = await Job.create({
    ...mockJobBase,
    sourceJobId: `m16-${Math.random().toString(36).slice(2)}`,
    title: "React Developer",
    ...overrides,
  });
  return job;
};

const createApplication = async (token: string, jobId: string) => {
  const res = await request(app)
    .post("/api/applications")
    .set("Authorization", `Bearer ${token}`)
    .send({ jobId });
  expect(res.status).toBe(201);
  return res.body.application;
};

const authorize = (token: string) => ({ Authorization: `Bearer ${token}` });

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
});

describe("M16 applyCapability classification", () => {
  test("external_url when a real apply URL exists on a non-LinkedIn source", () => {
    const result = classifyApplyCapability({
      source: "indeed",
      applyUrl: "https://indeed.com/apply/123",
      jobUrl: "https://indeed.com/job/123",
    });
    expect(result.capability).toBe("external_url");
    expect(result.handoffUrl).toBe("https://indeed.com/apply/123");
  });

  test("external_url falls back to jobUrl when no applyUrl", () => {
    const result = classifyApplyCapability({
      source: "indeed",
      applyUrl: null,
      jobUrl: "https://indeed.com/job/123",
    });
    expect(result.capability).toBe("external_url");
    expect(result.handoffUrl).toBe("https://indeed.com/job/123");
  });

  test("LinkedIn jobs are manual_required even with a URL (never automated)", () => {
    const result = classifyApplyCapability({
      source: "linkedin_jobs",
      applyUrl: "https://www.linkedin.com/jobs/view/123",
      jobUrl: "https://www.linkedin.com/jobs/view/123",
    });
    expect(result.capability).toBe("manual_required");
    expect(result.handoffUrl).toBe("https://www.linkedin.com/jobs/view/123");
    expect(result.label).toContain("Manual");
  });

  test("supported_api only when explicitly declared in metadata/rawSource", () => {
    const fromMetadata = classifyApplyCapability({
      source: "lever",
      applyUrl: null,
      jobUrl: null,
      metadata: { applyApi: "supported_api" },
    });
    expect(fromMetadata.capability).toBe("supported_api");

    const fromRawSource = classifyApplyCapability({
      source: "lever",
      rawSource: { applyApi: "supported_api" },
    });
    expect(fromRawSource.capability).toBe("supported_api");
  });

  test("supported_api is NOT inferred from a URL or well-known site", () => {
    const result = classifyApplyCapability({
      source: "lever",
      applyUrl: "https://jobs.lever.co/acme/123",
      jobUrl: "https://jobs.lever.co/acme/123",
      metadata: {},
    });
    expect(result.capability).toBe("external_url");
    expect(result.capability).not.toBe("supported_api");
  });

  test("no URL and no declared API -> manual_required with null handoff", () => {
    const result = classifyApplyCapability({
      source: "linkedin_jobs",
      applyUrl: null,
      jobUrl: null,
    });
    expect(result.capability).toBe("manual_required");
    expect(result.handoffUrl).toBeNull();
  });

  test("never invents a URL from a non-http value", () => {
    const result = classifyApplyCapability({
      source: "mock",
      applyUrl: "not-a-url",
      jobUrl: 123 as unknown as string,
    });
    expect(result.capability).toBe("manual_required");
    expect(result.handoffUrl).toBeNull();
  });
});

describe("M16 application execution - endpoints", () => {
  test("all execution endpoints require auth", async () => {
    const info = await request(app).get("/api/applications/abc/execution");
    expect(info.status).toBe(401);
    const prepare = await request(app).post("/api/applications/abc/execution/prepare");
    expect(prepare.status).toBe(401);
    const exec = await request(app).post("/api/applications/abc/execution").send({});
    expect(exec.status).toBe(401);
    const assist = await request(app).post("/api/applications/abc/fit-assist").send({});
    expect(assist.status).toBe(401);
  });

  test("GET /execution returns capability info without changing status", async () => {
    const { token } = await registerUser();
    const job = await createJob({ source: "indeed", applyUrl: "https://indeed.com/apply/x" });
    const application = await createApplication(token, String(job._id));

    const res = await request(app)
      .get(`/api/applications/${application._id}/execution`)
      .set(authorize(token));
    expect(res.status).toBe(200);
    expect(res.body.capabilityInfo.capability).toBe("external_url");
    expect(res.body.capabilityInfo.handoffUrl).toBe("https://indeed.com/apply/x");
    expect(res.body.application.status).toBe("saved");
    expect(res.body.application.id).toBe(application._id);

    const fresh = await Application.findById(application._id);
    expect(fresh!.status).toBe("saved");
  });

  test("GET /execution returns 404 for invalid id and cross-user", async () => {
    const { token } = await registerUser();
    const { token: tokenB } = await registerSecondUser();

    const invalid = await request(app)
      .get("/api/applications/not-an-objectid/execution")
      .set(authorize(token));
    expect(invalid.status).toBe(404);

    const job = await createJob();
    const application = await createApplication(token, String(job._id));
    const crossUser = await request(app)
      .get(`/api/applications/${application._id}/execution`)
      .set(authorize(tokenB));
    expect(crossUser.status).toBe(404);
  });

  test("POST /prepare returns review instructions and real handoff URL, status untouched", async () => {
    const { token } = await registerUser();
    const job = await createJob({ jobUrl: "https://indeed.com/job/9" });
    const application = await createApplication(token, String(job._id));

    const res = await request(app)
      .post(`/api/applications/${application._id}/execution/prepare`)
      .set(authorize(token));
    expect(res.status).toBe(200);
    expect(res.body.capabilityInfo.capability).toBe("external_url");
    expect(res.body.capabilityInfo.handoffUrl).toBe("https://indeed.com/job/9");
    expect(res.body.review.statusWillChangeOnConfirm).toBe(false);
    expect(res.body.instructions).toContain("external");

    const fresh = await Application.findById(application._id);
    expect(fresh!.status).toBe("saved");
  });

  test("POST /execution with submitted:false never changes status", async () => {
    const { token } = await registerUser();
    const job = await createJob();
    const application = await createApplication(token, String(job._id));

    const res = await request(app)
      .post(`/api/applications/${application._id}/execution`)
      .set(authorize(token))
      .send({ submitted: false });
    expect(res.status).toBe(200);
    expect(res.body.submitted).toBe(false);
    expect(res.body.statusChanged).toBe(false);
    expect(res.body.application.status).toBe("saved");

    const fresh = await Application.findById(application._id);
    expect(fresh!.status).toBe("saved");
    expect(fresh!.appliedAt).toBeUndefined();
  });

  test("POST /execution with submitted:true records the application as applied", async () => {
    const { token } = await registerUser();
    const job = await createJob();
    const application = await createApplication(token, String(job._id));

    const res = await request(app)
      .post(`/api/applications/${application._id}/execution`)
      .set(authorize(token))
      .send({ submitted: true });
    expect(res.status).toBe(200);
    expect(res.body.submitted).toBe(true);
    expect(res.body.statusChanged).toBe(true);
    expect(res.body.application.status).toBe("applied");

    const fresh = await Application.findById(application._id);
    expect(fresh!.status).toBe("applied");
    expect(fresh!.appliedAt).toBeTruthy();
  });

  test("re-confirming an already-applied application is idempotent", async () => {
    const { token } = await registerUser();
    const job = await createJob();
    const application = await createApplication(token, String(job._id));

    await request(app)
      .post(`/api/applications/${application._id}/execution`)
      .set(authorize(token))
      .send({ submitted: true });
    const appliedAt = (await Application.findById(application._id))!.appliedAt!.getTime();

    const res = await request(app)
      .post(`/api/applications/${application._id}/execution`)
      .set(authorize(token))
      .send({ submitted: true });
    expect(res.body.statusChanged).toBe(false);
    expect(res.body.application.status).toBe("applied");
    expect((await Application.findById(application._id))!.appliedAt!.getTime()).toBe(
      appliedAt
    );
  });

  test("supported_api job marks applied only on explicit confirmation (no fake submission)", async () => {
    const { token } = await registerUser();
    const job = await createJob({ metadata: { applyApi: "supported_api" } });
    const application = await createApplication(token, String(job._id));

    // Review/handoff does NOT change status.
    const prepare = await request(app)
      .post(`/api/applications/${application._id}/execution/prepare`)
      .set(authorize(token));
    expect(prepare.body.capabilityInfo.capability).toBe("supported_api");
    expect((await Application.findById(application._id))!.status).toBe("saved");

    // Explicit confirmation advances to applied with a clarifying message.
    const confirm = await request(app)
      .post(`/api/applications/${application._id}/execution`)
      .set(authorize(token))
      .send({ submitted: true });
    expect(confirm.status).toBe(200);
    expect(confirm.body.application.status).toBe("applied");
    expect(confirm.body.message).toContain("no automated API submission");
  });

  test("POST /execution rejects unknown fields (422 - strict zod)", async () => {
    const { token } = await registerUser();
    const job = await createJob();
    const application = await createApplication(token, String(job._id));

    const res = await request(app)
      .post(`/api/applications/${application._id}/execution`)
      .set(authorize(token))
      .send({ submitted: true, status: "interview" });
    expect(res.status).toBe(422);

    const res2 = await request(app)
      .post(`/api/applications/${application._id}/execution`)
      .set(authorize(token))
      .send({ submitted: "yes" });
    expect(res2.status).toBe(422);
  });

  test("POST /fit-assist rejects non-empty bodies (strict zod)", async () => {
    const { token } = await registerUser();
    const job = await createJob();
    const application = await createApplication(token, String(job._id));

    const res = await request(app)
      .post(`/api/applications/${application._id}/fit-assist`)
      .set(authorize(token))
      .send({ prompt: "make my profile better" });
    expect(res.status).toBe(422);
  });
});
