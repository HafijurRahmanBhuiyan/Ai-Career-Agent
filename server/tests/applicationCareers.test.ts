import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import Job from "../src/models/Job";
import { Application } from "../src/models/Application";
import { CareerEmail } from "../src/models/CareerEmail";
import ApplicationEvent from "../src/models/ApplicationEvent";

const mockJobBase = {
  source: "mock",
  companyName: "Acme Corp",
  fingerprint: "careerfp",
  description: "A test job",
  locations: ["Remote"],
  location: "Remote",
  remoteType: "remote",
  employmentType: "full-time",
  experienceLevel: "mid",
  skills: [],
  technologies: [],
  jobUrl: "https://example.com/job/123",
  applyUrl: "https://example.com/apply/123",
  rawSource: { secret: "never-leak-this" },
  lastSeenAt: new Date(),
  discoveredAt: new Date(),
  isActive: true,
};

const createJob = async (overrides: Record<string, unknown> = {}) => {
  const job = await Job.create({
    ...mockJobBase,
    sourceJobId: `cj-${Math.random().toString(36).slice(2)}`,
    title: "Senior Engineer",
    ...overrides,
  });
  return job;
};

const createApplication = async (
  userId: string,
  jobId: unknown,
  status = "screening"
) => {
  return Application.create({ user: userId, job: jobId, status });
};

const createCareerEmail = async (
  userId: string,
  application: unknown,
  overrides: Record<string, unknown> = {}
) => {
  return CareerEmail.create({
    user: userId,
    gmailMessageId: `msg-${Math.random().toString(36).slice(2)}`,
    subject: "Update on your application",
    from: "recruiter@acme.com",
    receivedAt: new Date(),
    category: "application_update",
    companyName: "Acme Corp",
    jobTitle: "Senior Engineer",
    ...overrides,
    application: application ?? null,
  });
};

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  jest.restoreAllMocks();
});

describe("Applications list - career visibility", () => {
  test("reveals detected stage, confidence, auto-applied flag, reason, latest event and job URL", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const job = await createJob();
    const application = await createApplication(
      userId,
      job._id,
      "applied"
    );
    await createCareerEmail(userId, application._id, {
      careerStatus: "interview",
      careerStatusConfidence: 0.93,
      careerStatusDetectedAt: new Date("2026-08-01T10:00:00.000Z"),
      autoStatusApplied: true,
      autoStatusReason: "High-confidence interview invitation signal",
    });
    await ApplicationEvent.create({
      user: userId,
      application: application._id,
      type: "status_changed",
      source: "gmail",
      title: "Status changed to interview",
      eventDate: new Date("2026-08-01T10:00:00.000Z"),
    });

    const res = await request(app)
      .get("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.pagination.total).toBe(1);
    const item = res.body.applications[0];
    expect(item._id).toBe(String(application._id));
    expect(item.status).toBe("applied");
    expect(item.job.jobUrl).toBe("https://example.com/job/123");
    expect(item.careerEmailDetection).toMatchObject({
      careerStatus: "interview",
      careerStatusConfidence: 0.93,
      autoStatusApplied: true,
      autoStatusReason: "High-confidence interview invitation signal",
      manualStatusApplied: false,
    });
    expect(item.latestStatusEvent).toMatchObject({
      title: "Status changed to interview",
      source: "gmail",
    });
  });

  test("shows manual-applied metadata when the status was applied manually", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const job = await createJob();
    const application = await createApplication(userId, job._id, "screening");
    await createCareerEmail(userId, application._id, {
      careerStatus: "interview",
      careerStatusConfidence: 0.6,
      autoStatusApplied: false,
      manualStatusApplied: true,
      manualStatusReason: "Manually applied status interview",
    });

    const res = await request(app)
      .get("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const item = res.body.applications[0];
    expect(item.careerEmailDetection.autoStatusApplied).toBe(false);
    expect(item.careerEmailDetection.manualStatusApplied).toBe(true);
    expect(item.careerEmailDetection.manualStatusReason).toBe(
      "Manually applied status interview"
    );
  });

  test("shows detection without auto-applied flag for low-confidence emails", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const job = await createJob();
    const application = await createApplication(userId, job._id, "screening");
    await createCareerEmail(userId, application._id, {
      careerStatus: "interview",
      careerStatusConfidence: 0.4,
      autoStatusApplied: false,
    });

    const res = await request(app)
      .get("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.applications[0].status).toBe("screening");
    expect(res.body.applications[0].careerEmailDetection).toMatchObject({
      careerStatus: "interview",
      autoStatusApplied: false,
    });
  });

  test("returns null detection and null latest event for applications without signals", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const job = await createJob();
    await createApplication(userId, job._id, "saved");

    const res = await request(app)
      .get("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.applications[0].careerEmailDetection).toBeNull();
    expect(res.body.applications[0].latestStatusEvent).toBeNull();
  });

  test("never leaks rawSource, metadata or user from the job payload", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const job = await createJob();
    const application = await createApplication(userId, job._id, "applied");
    await createCareerEmail(userId, application._id, {
      careerStatus: "offer",
      careerStatusConfidence: 0.9,
      autoStatusApplied: true,
    });

    const res = await request(app)
      .get("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const jobPayload = res.body.applications[0].job;
    expect(jobPayload.rawSource).toBeUndefined();
    expect(jobPayload.metadata).toBeUndefined();
    expect(res.body.applications[0].user).toBeUndefined();
  });
});

describe("Applications list - pagination and linking", () => {
  test("preserves pagination while enriching detection per page (no fabricated docs)", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const job = await createJob();
    const application = await createApplication(userId, job._id, "applied");
    await createCareerEmail(userId, application._id, {
      careerStatus: "interview",
      careerStatusConfidence: 0.9,
      autoStatusApplied: true,
    });
    await createJob({ sourceJobId: "zzz-second" }).then((job2) =>
      createApplication(userId, job2._id, "saved")
    );

    const res = await request(app)
      .get("/api/applications?limit=1&page=1")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(1);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.pagination.totalPages).toBe(2);
    expect(res.body.applications).toHaveLength(1);
    for (const appItem of res.body.applications) {
      expect(appItem).toHaveProperty("careerEmailDetection");
      expect(appItem).toHaveProperty("latestStatusEvent");
    }
  });

  test("status filter still narrows the list", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const job = await createJob();
    await createApplication(userId, job._id, "screening");
    const job2 = await createJob({ sourceJobId: "yyy-third" });
    await createApplication(userId, job2._id, "offer");

    const res = await request(app)
      .get("/api/applications?status=offer")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.pagination.total).toBe(1);
    expect(res.body.applications[0].status).toBe("offer");
  });
});

describe("CareerEmail linking visibility", () => {
  test("unmatched career emails surface with application: null (Not matched)", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await createCareerEmail(userId, null, {
      careerStatus: "interview",
      careerStatusConfidence: 0.2,
    });

    const res = await request(app)
      .get("/api/gmail/emails")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.emails).toHaveLength(1);
    expect(res.body.emails[0].application).toBeNull();
    expect(res.body.emails[0].careerStatus).toBe("interview");
  });
});

describe("Manual detected-status application", () => {
  test("applies an allowed hiring-stage transition, records manual metadata and exactly one event", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const job = await createJob();
    const application = await createApplication(userId, job._id, "screening");
    const email = await createCareerEmail(userId, application._id, {
      careerStatus: "interview",
      careerStatusConfidence: 0.9,
    });

    const res = await request(app)
      .post(`/api/gmail/emails/${email._id}/apply-status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "interview" })
      .expect(200);

    expect(res.body.application.status).toBe("interview");
    expect(res.body.unchanged).toBeUndefined();

    const persisted = await CareerEmail.findById(email._id);
    expect(persisted?.manualStatusApplied).toBe(true);
    expect(persisted?.manualStatusReason).toContain("interview");

    const events = await ApplicationEvent.countDocuments({
      application: application._id,
      type: "status_changed",
    });
    expect(events).toBe(1);
  });

  test("is idempotent: re-applying the current status never creates another event", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const job = await createJob();
    const application = await createApplication(userId, job._id, "interview");
    const email = await createCareerEmail(userId, application._id, {
      careerStatus: "interview",
      careerStatusConfidence: 0.9,
    });

    const first = await request(app)
      .post(`/api/gmail/emails/${email._id}/apply-status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "interview" })
      .expect(200);
    expect(first.body.unchanged).toBe(true);

    const second = await request(app)
      .post(`/api/gmail/emails/${email._id}/apply-status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "interview" })
      .expect(200);
    expect(second.body.unchanged).toBe(true);

    const events = await ApplicationEvent.countDocuments({
      application: application._id,
      type: "status_changed",
    });
    expect(events).toBe(0);
  });

  test("rejects applying 'applied' (reserved for the execution flow)", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const job = await createJob();
    const application = await createApplication(userId, job._id, "screening");
    const email = await createCareerEmail(userId, application._id, {
      careerStatus: "interview",
    });

    const res = await request(app)
      .post(`/api/gmail/emails/${email._id}/apply-status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "applied" })
      .expect(422);

    expect(String(res.body.error)).toMatch(/validation/i);
    const unchanged = await Application.findById(application._id);
    expect(unchanged?.status).toBe("screening");
  });

  test("rejects applying 'withdrawn' (never applied from a career email)", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const job = await createJob();
    const application = await createApplication(userId, job._id, "interview");
    const email = await createCareerEmail(userId, application._id, {
      careerStatus: "rejected",
    });

    await request(app)
      .post(`/api/gmail/emails/${email._id}/apply-status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "withdrawn" })
      .expect(422);

    const unchanged = await Application.findById(application._id);
    expect(unchanged?.status).toBe("interview");
  });

  test("rejects a disallowed transition from a withdrawn application (409, unchanged)", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const job = await createJob();
    const application = await createApplication(userId, job._id, "withdrawn");
    const email = await createCareerEmail(userId, application._id, {
      careerStatus: "offer",
    });

    const res = await request(app)
      .post(`/api/gmail/emails/${email._id}/apply-status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "offer" })
      .expect(409);

    const unchanged = await Application.findById(application._id);
    expect(unchanged?.status).toBe("withdrawn");
    expect(res.body.error).toMatch(/not allowed/i);
  });

  test("protects terminal states: offer cannot move backwards", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const job = await createJob();
    const application = await createApplication(userId, job._id, "offer");
    const email = await createCareerEmail(userId, application._id, {
      careerStatus: "screening",
    });

    await request(app)
      .post(`/api/gmail/emails/${email._id}/apply-status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "screening" })
      .expect(409);

    const unchanged = await Application.findById(application._id);
    expect(unchanged?.status).toBe("offer");
  });

  test("rejects applying a status to an email that is not linked to an application", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const email = await createCareerEmail(userId, null, {
      careerStatus: "interview",
    });

    const res = await request(app)
      .post(`/api/gmail/emails/${email._id}/apply-status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "interview" })
      .expect(400);

    expect(res.body.error).toMatch(/not linked/i);
  });

  test("returns 404 for another user's email", async () => {
    const first = await registerUser();
    const second = await registerSecondUser();
    const firstId = (first.user as { id: string }).id;
    const job = await createJob();
    const application = await createApplication(firstId, job._id, "screening");
    const email = await createCareerEmail(firstId, application._id, {
      careerStatus: "interview",
    });

    await request(app)
      .post(`/api/gmail/emails/${email._id}/apply-status`)
      .set("Authorization", `Bearer ${second.token}`)
      .send({ status: "interview" })
      .expect(404);
  });

  test("returns 404 for a malformed email id", async () => {
    const { token } = await registerUser();
    await request(app)
      .post("/api/gmail/emails/not-an-id/apply-status")
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "interview" })
      .expect(404);
  });
});

describe("Cross-user isolation", () => {
  test("a user never sees another user's application in the list or detail", async () => {
    const first = await registerUser();
    const second = await registerSecondUser();
    const firstId = (first.user as { id: string }).id;
    const job = await createJob();
    const application = await createApplication(firstId, job._id, "applied");

    const list = await request(app)
      .get("/api/applications")
      .set("Authorization", `Bearer ${second.token}`)
      .expect(200);
    expect(list.body.pagination.total).toBe(0);

    await request(app)
      .get(`/api/applications/${application._id}`)
      .set("Authorization", `Bearer ${second.token}`)
      .expect(404);
  });
});

describe("Existing application flow unchanged", () => {
  test("create, update and detail still behave as before", async () => {
    const { token } = await registerUser();
    const job = await createJob();

    const created = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id) })
      .expect(201);
    expect(created.body.application.status).toBe("saved");

    const id = created.body.application._id;
    const updated = await request(app)
      .patch(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "applied" })
      .expect(200);
    expect(updated.body.application.status).toBe("applied");

    const detail = await request(app)
      .get(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(detail.body.timeline).toHaveProperty("count");
    expect(detail.body.timeline.count).toBeGreaterThanOrEqual(2);
    expect(detail.body).toHaveProperty("emails");
    expect(detail.body).toHaveProperty("jobMatch");
  });
});