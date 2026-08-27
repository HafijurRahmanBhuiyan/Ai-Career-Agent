import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import Job from "../src/models/Job";

const mockJobBase = {
  source: "mock",
  companyName: "Acme Corp",
  fingerprint: "appfp",
  description: "A test job",
  locations: ["Remote"],
  location: "Remote",
  remoteType: "remote",
  employmentType: "full-time",
  experienceLevel: "mid",
  salaryMin: 90000,
  salaryMax: 130000,
  salaryCurrency: "USD",
  salaryPeriod: "yearly",
  skills: [],
  technologies: [],
  jobUrl: "https://example.com/job/app",
  applyUrl: "https://example.com/apply/app",
  rawSource: {},
  lastSeenAt: new Date(),
  discoveredAt: new Date(),
  isActive: true,
};

const createJob = async (overrides: Record<string, unknown> = {}) => {
  const job = await Job.create({
    ...mockJobBase,
    sourceJobId: `app-${Math.random().toString(36).slice(2)}`,
    title: "React Developer",
    ...overrides,
  });
  return job;
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

describe("Applications API - authentication", () => {
  test("POST /api/applications requires authentication", async () => {
    const res = await request(app)
      .post("/api/applications")
      .send({ jobId: "507f1f77bcf86cd799439011" });
    expect(res.status).toBe(401);
  });

  test("GET /api/applications requires authentication", async () => {
    const res = await request(app).get("/api/applications");
    expect(res.status).toBe(401);
  });

  test("GET /api/applications/:id requires authentication", async () => {
    const res = await request(app).get("/api/applications/507f1f77bcf86cd799439011");
    expect(res.status).toBe(401);
  });

  test("PATCH /api/applications/:id requires authentication", async () => {
    const res = await request(app)
      .patch("/api/applications/507f1f77bcf86cd799439011")
      .send({ status: "applied" });
    expect(res.status).toBe(401);
  });

  test("DELETE /api/applications/:id requires authentication", async () => {
    const res = await request(app).delete("/api/applications/507f1f77bcf86cd799439011");
    expect(res.status).toBe(401);
  });
});

describe("Applications API - create", () => {
  test("creates an application with default saved status", async () => {
    const { token } = await registerUser();
    const job = await createJob();

    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id) });

    expect(res.status).toBe(201);
    expect(res.body.application.status).toBe("saved");
    expect(res.body.application.appliedAt).toBeUndefined();
    expect(res.body.application.job._id).toBe(String(job._id));
    expect(res.body.application.job.title).toBe("React Developer");
    expect(res.body.application).not.toHaveProperty("user");
    expect(res.body.application.job).not.toHaveProperty("rawSource");
  });

  test("creates an application with an explicit status", async () => {
    const { token } = await registerUser();
    const job = await createJob();

    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id), status: "interview" });

    expect(res.status).toBe(201);
    expect(res.body.application.status).toBe("interview");
  });

  test("sets appliedAt to now when status is applied and no date supplied", async () => {
    const { token } = await registerUser();
    const job = await createJob();
    const before = Date.now();

    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id), status: "applied" });

    expect(res.status).toBe(201);
    const appliedAt = new Date(res.body.application.appliedAt).getTime();
    expect(appliedAt).toBeGreaterThanOrEqual(before - 5000);
    expect(appliedAt).toBeLessThanOrEqual(Date.now() + 5000);
  });

  test("uses the supplied appliedAt when provided", async () => {
    const { token } = await registerUser();
    const job = await createJob();

    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jobId: String(job._id),
        status: "applied",
        appliedAt: "2024-01-15T00:00:00.000Z",
      });

    expect(res.status).toBe(201);
    expect(new Date(res.body.application.appliedAt).toISOString()).toBe(
      "2024-01-15T00:00:00.000Z"
    );
  });

  test("does not invent appliedAt for a non-applied status", async () => {
    const { token } = await registerUser();
    const job = await createJob();

    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id), status: "saved" });

    expect(res.status).toBe(201);
    expect(res.body.application.appliedAt).toBeUndefined();
  });

  test("returns 404 when the job does not exist", async () => {
    const { token } = await registerUser();

    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: "507f1f77bcf86cd799439011" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Job not found");
  });

  test("returns 404 when the job is inactive", async () => {
    const { token } = await registerUser();
    const job = await createJob({ isActive: false });

    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id) });

    expect(res.status).toBe(404);
  });

  test("returns 422 for an invalid job ID format", async () => {
    const { token } = await registerUser();

    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: "not-a-valid-id" });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Validation failed");
  });

  test("returns 422 for an invalid status", async () => {
    const { token } = await registerUser();
    const job = await createJob();

    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id), status: "not-a-status" });

    expect(res.status).toBe(422);
  });
});

describe("Applications API - duplicates", () => {
  test("returns 409 when creating a duplicate application for the same job", async () => {
    const { token } = await registerUser();
    const job = await createJob();
    const jobId = String(job._id);

    const first = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId });
    expect(first.status).toBe(201);

    const dup = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId });

    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("Application already exists for this job");
  });

  test("allows two different users to apply to the same job", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const job = await createJob();
    const jobId = String(job._id);

    const first = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId });
    const second = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token2}`)
      .send({ jobId });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });
});

describe("Applications API - list", () => {
  test("returns an empty list when the user has no applications", async () => {
    const { token } = await registerUser();

    const res = await request(app)
      .get("/api/applications")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.applications).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  test("lists the authenticated user's applications only", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const job = await createJob();

    await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id) });
    await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token2}`)
      .send({ jobId: String(job._id) });

    const res = await request(app)
      .get("/api/applications")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0].job.title).toBe("React Developer");
  });

  test("supports pagination", async () => {
    const { token } = await registerUser();
    const jobs = await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        createJob({ sourceJobId: `pg-${i}`, title: `Job ${i}` })
      )
    );
    for (const job of jobs) {
      await request(app)
        .post("/api/applications")
        .set("Authorization", `Bearer ${token}`)
        .send({ jobId: String(job._id) });
    }

    const res = await request(app)
      .get("/api/applications")
      .query({ page: 1, limit: 2 })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(2);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(2);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.totalPages).toBe(2);
  });

  test("rejects a limit above the maximum", async () => {
    const { token } = await registerUser();

    const res = await request(app)
      .get("/api/applications")
      .query({ limit: 100 })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(422);
  });

  test("filters applications by status", async () => {
    const { token } = await registerUser();
    const job = await createJob();
    const jobId = String(job._id);

    const created = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId, status: "saved" });

    await request(app)
      .patch(`/api/applications/${created.body.application._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "interview" });

    const res = await request(app)
      .get("/api/applications")
      .query({ status: "interview" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0].status).toBe("interview");
  });

  test("rejects an invalid status filter", async () => {
    const { token } = await registerUser();

    const res = await request(app)
      .get("/api/applications")
      .query({ status: "nope" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(422);
  });
});

describe("Applications API - get single", () => {
  test("returns a single application owned by the user", async () => {
    const { token } = await registerUser();
    const job = await createJob();

    const created = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id) });

    const id = created.body.application._id;
    const res = await request(app)
      .get(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.application._id).toBe(id);
    expect(res.body.application.job.title).toBe("React Developer");
  });

  test("returns 404 for another user's application", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const job = await createJob();

    const created = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id) });

    const res = await request(app)
      .get(`/api/applications/${created.body.application._id}`)
      .set("Authorization", `Bearer ${token2}`);

    expect(res.status).toBe(404);
  });

  test("returns 404 for an unknown application id", async () => {
    const { token } = await registerUser();

    const res = await request(app)
      .get("/api/applications/507f1f77bcf86cd799439011")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe("Applications API - update", () => {
  const createSavedApp = async (token: string) => {
    const job = await createJob();
    const created = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id) });
    return { id: created.body.application._id, jobId: String(job._id) };
  };

  test("updates the status", async () => {
    const { token } = await registerUser();
    const { id } = await createSavedApp(token);

    const res = await request(app)
      .patch(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "screening" });

    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe("screening");
  });

  test("sets appliedAt when transitioning to applied", async () => {
    const { token } = await registerUser();
    const { id } = await createSavedApp(token);

    const res = await request(app)
      .patch(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "applied" });

    expect(res.status).toBe(200);
    expect(new Date(res.body.application.appliedAt).getTime()).toBeGreaterThan(0);
  });

  test("does not erase appliedAt when moving away from applied", async () => {
    const { token } = await registerUser();
    const { id } = await createSavedApp(token);

    await request(app)
      .patch(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "applied" });
    const res = await request(app)
      .patch(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "interview" });

    expect(res.status).toBe(200);
    expect(new Date(res.body.application.appliedAt).getTime()).toBeGreaterThan(0);
  });

  test("clears appliedAt when explicitly set to null", async () => {
    const { token } = await registerUser();
    const { id } = await createSavedApp(token);

    await request(app)
      .patch(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "applied" });
    const res = await request(app)
      .patch(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "saved", appliedAt: null });

    expect(res.status).toBe(200);
    expect(res.body.application.appliedAt).toBeNull();
  });

  test("updates the notes", async () => {
    const { token } = await registerUser();
    const { id } = await createSavedApp(token);

    const res = await request(app)
      .patch(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "Applying with a tailored resume" });

    expect(res.status).toBe(200);
    expect(res.body.application.notes).toBe("Applying with a tailored resume");
  });

  test("updates the applied date", async () => {
    const { token } = await registerUser();
    const { id } = await createSavedApp(token);

    const res = await request(app)
      .patch(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ appliedAt: "2024-05-01T00:00:00.000Z" });

    expect(res.status).toBe(200);
    expect(new Date(res.body.application.appliedAt).toISOString()).toBe(
      "2024-05-01T00:00:00.000Z"
    );
  });

  test("returns 404 when updating another user's application", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const { id } = await createSavedApp(token);

    const res = await request(app)
      .patch(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ status: "offer" });

    expect(res.status).toBe(404);
  });

  test("returns 422 when no fields are provided", async () => {
    const { token } = await registerUser();
    const { id } = await createSavedApp(token);

    const res = await request(app)
      .patch(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(422);
  });

  test("returns 422 for an invalid status", async () => {
    const { token } = await registerUser();
    const { id } = await createSavedApp(token);

    const res = await request(app)
      .patch(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "bad-status" });

    expect(res.status).toBe(422);
  });
});

describe("Applications API - delete", () => {
  test("deletes the authenticated user's application", async () => {
    const { token } = await registerUser();
    const job = await createJob();

    const created = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id) });
    const id = created.body.application._id;

    const res = await request(app)
      .delete(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Application deleted");

    const gone = await request(app)
      .get(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(gone.status).toBe(404);
  });

  test("returns 404 when deleting another user's application", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const job = await createJob();

    const created = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id) });

    const res = await request(app)
      .delete(`/api/applications/${created.body.application._id}`)
      .set("Authorization", `Bearer ${token2}`);

    expect(res.status).toBe(404);
  });

  test("returns 404 for an unknown application id", async () => {
    const { token } = await registerUser();

    const res = await request(app)
      .delete("/api/applications/507f1f77bcf86cd799439011")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
