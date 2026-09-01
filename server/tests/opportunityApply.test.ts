import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import Job from "../src/models/Job";
import { Application, APPLICATION_STATUSES } from "../src/models/Application";
import ApplicationEvent from "../src/models/ApplicationEvent";
import {
  validateHandoffUrl,
  classifyApplyCapability,
} from "../src/services/applyCapability";

const mockJobBase = {
  source: "mock",
  companyName: "Acme Corp",
  fingerprint: "s4fp",
  description: "A test job for the opportunity apply flow",
  locations: ["Remote"],
  location: "Remote",
  remoteType: "remote",
  employmentType: "full-time",
  experienceLevel: "mid",
  skills: ["React"],
  technologies: ["React"],
  rawSource: {},
  metadata: {},
  lastSeenAt: new Date(),
  discoveredAt: new Date(),
  isActive: true,
};

const createJob = async (overrides: Record<string, unknown> = {}) => {
  const job = await Job.create({
    ...mockJobBase,
    sourceJobId: `s4-${Math.random().toString(36).slice(2)}`,
    title: "React Developer",
    ...overrides,
  });
  return job;
};

const apply = (token: string, jobId: string | unknown) =>
  request(app)
    .post(`/api/jobs/opportunities/${jobId}/apply`)
    .set("Authorization", `Bearer ${token}`);

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

describe("validateHandoffUrl", () => {
  test("accepts https URLs and trims whitespace", () => {
    expect(validateHandoffUrl("  https://example.com/apply/1  ")).toBe(
      "https://example.com/apply/1"
    );
  });

  test("accepts http URLs", () => {
    expect(validateHandoffUrl("http://example.com/apply/1")).toBe(
      "http://example.com/apply/1"
    );
  });

  test("accepts URLs with ports, paths, queries and credentials-bearing hosts", () => {
    expect(validateHandoffUrl("https://example.com:8443/jobs?ref=1")).toBeTruthy();
    expect(validateHandoffUrl("https://sub.example.com/p/a/t/h")).toBeTruthy();
  });

  const rejects = (value: unknown) => {
    expect(validateHandoffUrl(value)).toBeNull();
  };

  test("rejects javascript: URLs", () => {
    rejects("javascript:alert(1)");
  });

  test("rejects data: URLs", () => {
    rejects("data:text/html,<script>alert(1)</script>");
  });

  test("rejects blob:, file: and about: URLs", () => {
    rejects("blob:https://example.com/abc");
    rejects("file:///etc/passwd");
    rejects("about:blank");
  });

  test("rejects malformed URLs", () => {
    rejects("not-a-url");
    rejects("ht!tp://example.com");
    rejects("https://exa mple.com");
  });

  test("rejects hostless https:// values", () => {
    rejects("https://");
    rejects("http://");
  });

  test("rejects empty and whitespace-only strings", () => {
    rejects("");
    rejects("   ");
  });

  test("rejects non-string values", () => {
    rejects(null);
    rejects(undefined);
    rejects(12345);
  });

  test("classifyApplyCapability uses the canonical validator (applyUrl precedence)", () => {
    const result = classifyApplyCapability({
      source: "mock",
      applyUrl: "https://example.com/apply",
      jobUrl: "https://example.com/job",
    });
    expect(result.capability).toBe("external_url");
    expect(result.handoffUrl).toBe("https://example.com/apply");
  });

  test("classifyApplyCapability falls back applyUrl -> jobUrl when applyUrl is invalid", () => {
    const result = classifyApplyCapability({
      source: "mock",
      applyUrl: "javascript:alert(1)",
      jobUrl: "https://example.com/job",
    });
    expect(result.handoffUrl).toBe("https://example.com/job");
    expect(result.capability).toBe("external_url");
  });
});

describe("Opportunity apply compose endpoint", () => {
  test("A. requires authentication", async () => {
    const job = await createJob();
    const res = await request(app).post(`/api/jobs/opportunities/${job._id}/apply`);
    expect(res.status).toBe(401);
  });

  test("B. authenticated apply creates an Application (status saved) and returns handoff payload", async () => {
    const { token } = await registerUser();
    const job = await createJob({
      source: "indeed",
      applyUrl: "https://indeed.com/apply/x1",
      jobUrl: "https://indeed.com/job/x1",
    });

    const res = await apply(token, job._id);
    expect(res.status).toBe(200);
    expect(res.body.capabilityInfo.capability).toBe("external_url");
    expect(res.body.capabilityInfo.handoffUrl).toBe("https://indeed.com/apply/x1");
    expect(res.body.application.status).toBe("saved");
    expect(res.body.application.id).toBeTruthy();

    const apps = await Application.find({ job: job._id });
    expect(apps).toHaveLength(1);
    expect(apps[0].status).toBe("saved");
    expect(apps[0].appliedAt).toBeUndefined();
  });

  test("C. second apply reuses the existing Application", async () => {
    const { token } = await registerUser();
    const job = await createJob({ applyUrl: "https://example.com/apply/reuse" });

    const first = await apply(token, job._id);
    expect(first.status).toBe(200);

    const second = await apply(token, job._id);
    expect(second.status).toBe(200);
    expect(second.body.application.id).toBe(first.body.application.id);
    expect(second.body.application.status).toBe("saved");

    const count = await Application.countDocuments({ job: job._id });
    expect(count).toBe(1);
  });

  test("D. unique {user,job} protection remains intact (create API still 409s)", async () => {
    const { token } = await registerUser();
    const job = await createJob({ applyUrl: "https://example.com/apply/dup" });

    await apply(token, job._id).expect(200);

    const dup = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id) });
    expect(dup.status).toBe(409);

    const count = await Application.countDocuments({ job: job._id });
    expect(count).toBe(1);
  });

  test("E. different user cannot operate another user's application", async () => {
    const { token: tokenA } = await registerUser();
    const { token: tokenB } = await registerSecondUser();
    const job = await createJob({ applyUrl: "https://example.com/apply/scoped" });

    const resA = await apply(tokenA, job._id);
    expect(resA.status).toBe(200);
    const appIdA = resA.body.application.id;

    // B gets their own application, never A's.
    const resB = await apply(tokenB, job._id);
    expect(resB.status).toBe(200);
    expect(resB.body.application.id).not.toBe(appIdA);

    const countForJob = await Application.countDocuments({ job: job._id });
    expect(countForJob).toBe(2);

    // B cannot read A's application via execution or detail endpoints.
    const crossRead = await request(app)
      .get(`/api/applications/${appIdA}/execution`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(crossRead.status).toBe(404);

    const crossDetail = await request(app)
      .get(`/api/applications/${appIdA}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(crossDetail.status).toBe(404);
  });

  test("F. valid https applyUrl is returned as the handoff URL", async () => {
    const { token } = await registerUser();
    const job = await createJob({ applyUrl: "https://secure.example.com/apply/f" });
    const res = await apply(token, job._id);
    expect(res.status).toBe(200);
    expect(res.body.capabilityInfo.handoffUrl).toBe("https://secure.example.com/apply/f");
  });

  test("G. valid http applyUrl is returned as the handoff URL", async () => {
    const { token } = await registerUser();
    const job = await createJob({ applyUrl: "http://insecure.example.com/apply/g" });
    const res = await apply(token, job._id);
    expect(res.status).toBe(200);
    expect(res.body.capabilityInfo.handoffUrl).toBe("http://insecure.example.com/apply/g");
  });

  test("H. javascript: applyUrl is rejected (falls back to valid jobUrl)", async () => {
    const { token } = await registerUser();
    const job = await createJob({
      applyUrl: "javascript:alert(1)",
      jobUrl: "https://example.com/job/h",
    });
    const res = await apply(token, job._id);
    expect(res.status).toBe(200);
    expect(res.body.capabilityInfo.handoffUrl).toBe("https://example.com/job/h");
    expect(res.body.capabilityInfo.handoffUrl).not.toContain("javascript:");
  });

  test("I. data: applyUrl is rejected", async () => {
    const { token } = await registerUser();
    const job = await createJob({
      applyUrl: "data:text/html,<script>alert(1)</script>",
      jobUrl: "https://example.com/job/i",
    });
    const res = await apply(token, job._id);
    expect(res.status).toBe(200);
    expect(res.body.capabilityInfo.handoffUrl).toBe("https://example.com/job/i");
    expect(res.body.capabilityInfo.handoffUrl).not.toContain("data:");
  });

  test("J. malformed URL is rejected (no handoff invented)", async () => {
    const { token } = await registerUser();
    const job = await createJob({
      applyUrl: "ht!tp://totally-not-a-url",
      jobUrl: null,
    });
    const res = await apply(token, job._id);
    expect(res.status).toBe(200);
    expect(res.body.capabilityInfo.handoffUrl).toBeNull();
  });

  test("K. hostless https:// applyUrl is rejected", async () => {
    const { token } = await registerUser();
    const job = await createJob({
      applyUrl: "https://",
      jobUrl: "https://example.com/job/k",
    });
    const res = await apply(token, job._id);
    expect(res.status).toBe(200);
    expect(res.body.capabilityInfo.handoffUrl).toBe("https://example.com/job/k");
  });

  test("L. falls back from invalid/missing applyUrl to a valid jobUrl", async () => {
    const { token } = await registerUser();
    const missing = await createJob({
      applyUrl: null,
      jobUrl: "https://example.com/job/l-missing",
    });
    const resMissing = await apply(token, missing._id);
    expect(resMissing.body.capabilityInfo.handoffUrl).toBe(
      "https://example.com/job/l-missing"
    );

    const invalid = await createJob({
      applyUrl: "not-a-url",
      jobUrl: "https://example.com/job/l-invalid",
    });
    const resInvalid = await apply(token, invalid._id);
    expect(resInvalid.body.capabilityInfo.handoffUrl).toBe(
      "https://example.com/job/l-invalid"
    );
  });

  test("M. no valid URL -> no handoff URL and manual_required capability", async () => {
    const { token } = await registerUser();
    const job = await createJob({ applyUrl: null, jobUrl: null });
    const res = await apply(token, job._id);
    expect(res.status).toBe(200);
    expect(res.body.capabilityInfo.handoffUrl).toBeNull();
    expect(res.body.capabilityInfo.capability).toBe("manual_required");
    expect(res.body.application.status).toBe("saved");
  });

  test("N. apply compose never marks the application as applied", async () => {
    const { token } = await registerUser();
    const job = await createJob({ applyUrl: "https://example.com/apply/n" });
    const res = await apply(token, job._id);
    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe("saved");

    const stored = await Application.findOne({ job: job._id });
    expect(stored!.status).toBe("saved");
    expect(stored!.appliedAt).toBeUndefined();
  });

  test("Q. saved application remains saved before confirmation", async () => {
    const { token } = await registerUser();
    const job = await createJob({ applyUrl: "https://example.com/apply/q" });

    const applied = await apply(token, job._id);
    const appId = applied.body.application.id;
    expect(applied.body.application.status).toBe("saved");

    const prepare = await request(app)
      .post(`/api/applications/${appId}/execution/prepare`)
      .set("Authorization", `Bearer ${token}`);
    expect(prepare.status).toBe(200);
    expect(prepare.body.application.status).toBe("saved");

    const stored = await Application.findById(appId);
    expect(stored!.status).toBe("saved");
  });

  test("O. only execution {submitted:true} advances the application to applied", async () => {
    const { token } = await registerUser();
    const job = await createJob({ applyUrl: "https://example.com/apply/o" });

    const applied = await apply(token, job._id);
    const appId = applied.body.application.id;
    expect(applied.body.application.status).toBe("saved");

    const execute = await request(app)
      .post(`/api/applications/${appId}/execution`)
      .set("Authorization", `Bearer ${token}`)
      .send({ submitted: true });
    expect(execute.status).toBe(200);
    expect(execute.body.application.status).toBe("applied");
    expect(execute.body.statusChanged).toBe(true);

    const stored = await Application.findById(appId);
    expect(stored!.status).toBe("applied");
    expect(stored!.appliedAt).toBeTruthy();
  });

  test("P. explicit confirmation writes the status-changed timeline event", async () => {
    const { token } = await registerUser();
    const job = await createJob({ applyUrl: "https://example.com/apply/p" });

    const applied = await apply(token, job._id);
    const appId = applied.body.application.id;

    await request(app)
      .post(`/api/applications/${appId}/execution`)
      .set("Authorization", `Bearer ${token}`)
      .send({ submitted: true })
      .expect(200);

    const event = await ApplicationEvent.findOne({
      application: appId,
      type: "status_changed",
    });
    expect(event).not.toBeNull();
    expect(event!.source).toBe("system");
    expect(event!.title).toContain("applied");
  });

  test("V. LinkedIn/manual_required with a valid URL still returns the real URL", async () => {
    const { token } = await registerUser();
    const job = await createJob({
      source: "linkedin_jobs",
      applyUrl: "https://www.linkedin.com/jobs/view/123",
    });
    const res = await apply(token, job._id);
    expect(res.status).toBe(200);
    expect(res.body.capabilityInfo.capability).toBe("manual_required");
    expect(res.body.capabilityInfo.handoffUrl).toBe(
      "https://www.linkedin.com/jobs/view/123"
    );
  });

  test("W. concurrent duplicate applies do not create duplicate Application documents", async () => {
    const { token } = await registerUser();
    const job = await createJob({ applyUrl: "https://example.com/apply/w" });

    const [a, b] = await Promise.all([
      apply(token, job._id),
      apply(token, job._id),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const count = await Application.countDocuments({ job: job._id });
    expect(count).toBe(1);
  });

  test("applying to an inactive job returns 404", async () => {
    const { token } = await registerUser();
    const job = await createJob({ isActive: false });
    const res = await apply(token, job._id);
    expect(res.status).toBe(404);
  });

  test("applying with a malformed job id returns 404", async () => {
    const { token } = await registerUser();
    const res = await apply(token, "not-a-valid-objectid");
    expect(res.status).toBe(404);
  });
});

describe("Opportunity feed applicationStatus", () => {
  test("S. feed still returns alreadyApplied and R. exposes applicationStatus", async () => {
    const { token, user } = await registerUser();
    const job = await createJob({ applyUrl: "https://example.com/apply/r" });

    const before = await request(app)
      .get("/api/jobs/opportunities")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(before.body.opportunities[0].alreadyApplied).toBe(false);
    expect(before.body.opportunities[0].applicationStatus).toBeNull();

    await apply(token, job._id).expect(200);

    const after = await request(app)
      .get("/api/jobs/opportunities")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(after.body.opportunities[0].alreadyApplied).toBe(true);
    expect(after.body.opportunities[0].applicationStatus).toBe("saved");
  });

  test("T. each Application status appears correctly in the feed", async () => {
    const { token } = await registerUser();
    const job = await createJob({ applyUrl: "https://example.com/apply/t" });
    await apply(token, job._id).expect(200);
    const storedApp = await Application.findOne({ job: job._id });

    for (const status of APPLICATION_STATUSES) {
      await Application.findByIdAndUpdate(storedApp!._id, { status });

      const res = await request(app)
        .get("/api/jobs/opportunities")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body.opportunities[0].applicationStatus).toBe(status);
      expect(res.body.opportunities[0].alreadyApplied).toBe(true);
    }
  });

  test("U. another user's Application is never exposed via the feed", async () => {
    const { token: tokenA } = await registerUser();
    const { token: tokenB } = await registerSecondUser();
    const job = await createJob({ applyUrl: "https://example.com/apply/u" });

    await apply(tokenA, job._id).expect(200);

    const viaFeed = await request(app)
      .get("/api/jobs/opportunities")
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);
    expect(viaFeed.body.opportunities[0].applicationStatus).toBeNull();
    expect(viaFeed.body.opportunities[0].alreadyApplied).toBe(false);

    const viaDetail = await request(app)
      .get(`/api/jobs/opportunities/${job._id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);
    expect(viaDetail.body.applicationStatus).toBeNull();
    expect(viaDetail.body.alreadyApplied).toBe(false);
  });
});