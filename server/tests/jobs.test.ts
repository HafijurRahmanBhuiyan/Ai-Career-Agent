import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser } from "./helpers";
import Job from "../src/models/Job";

const mockJobBase = {
  source: "mock",
  companyName: "Acme Corp",
  fingerprint: "fp",
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
  jobUrl: "https://example.com/job/1",
  applyUrl: "https://example.com/apply/1",
  rawSource: {},
  lastSeenAt: new Date(),
  discoveredAt: new Date(),
  isActive: true,
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

describe("Jobs API - search page", () => {
  test("requires authentication", async () => {
    const res = await request(app).get("/api/jobs");
    expect(res.status).toBe(401);
  });

  test("returns an empty list when no jobs exist", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/jobs")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.jobs).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  test("lists persisted jobs with pagination details", async () => {
    const { token } = await registerUser();
    await Job.create([
      {
        ...mockJobBase,
        sourceJobId: "alpha",
        title: "React Developer",
        companyName: "Acme",
      },
      {
        ...mockJobBase,
        sourceJobId: "beta",
        title: "Node Developer",
        companyName: "Globex",
        remoteType: "onsite",
        experienceLevel: "senior",
      },
    ]);

    const res = await request(app)
      .get("/api/jobs")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(2);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(20);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.jobs[0]).not.toHaveProperty("rawSource");
  });

  test("filters jobs by keywords", async () => {
    const { token } = await registerUser();
    await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const res = await request(app)
      .get("/api/jobs")
      .query({ keywords: "Frontend" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBeGreaterThan(0);
    expect(
      res.body.jobs.every((j: { title: string; description: string }) =>
        j.title.toLowerCase().includes("frontend") ||
        j.description.toLowerCase().includes("frontend")
      )
    ).toBe(true);
  });

  test("filters jobs by remote type", async () => {
    const { token } = await registerUser();
    await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const res = await request(app)
      .get("/api/jobs")
      .query({ remote: "remote" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBeGreaterThan(0);
    expect(
      res.body.jobs.every((j: { remoteType: string }) => j.remoteType === "remote")
    ).toBe(true);
  });

  test("filters jobs by employment type", async () => {
    const { token } = await registerUser();
    await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const res = await request(app)
      .get("/api/jobs")
      .query({ employmentType: "contract" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBeGreaterThan(0);
    expect(
      res.body.jobs.every(
        (j: { employmentType: string }) => j.employmentType === "contract"
      )
    ).toBe(true);
  });

  test("filters jobs by location", async () => {
    const { token } = await registerUser();
    await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const res = await request(app)
      .get("/api/jobs")
      .query({ location: "Seattle" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBeGreaterThan(0);
    expect(
      res.body.jobs.every((j: { locations: string[] }) =>
        j.locations.some((loc) => loc.toLowerCase().includes("seattle"))
      )
    ).toBe(true);
  });

  test("paginates results with a custom limit", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/jobs")
      .query({ limit: 5, page: 2 })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBeLessThanOrEqual(5);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.limit).toBe(5);
  });

  test("rejects a limit above the maximum", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/jobs")
      .query({ limit: 100 })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Validation failed");
  });

  test("rejects an invalid remote type", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/jobs")
      .query({ remote: "everywhere" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  test("treats NoSQL injection payload as a safe string match (no crash)", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/jobs")
      .query({ keywords: "$gt" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.jobs)).toBe(true);
  });

  test("escapes regex metacharacters in keywords", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/jobs")
      .query({ keywords: ".*[a-z]+" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.jobs)).toBe(true);
  });
});

describe("Jobs API - discovery endpoint", () => {
  test("requires authentication", async () => {
    const res = await request(app).post("/api/jobs/discover").send({});
    expect(res.status).toBe(401);
  });

  test("discovers jobs from the mock source and persists them", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.sources.length).toBeGreaterThan(0);
    expect(res.body.sources[0].status).toBe("success");
    expect(res.body.count).toBeGreaterThan(0);
    expect(res.body.jobs.length).toBe(res.body.count);

    const persisted = await Job.countDocuments({});
    expect(persisted).toBe(res.body.count);
  });

  test("deduplicates identical jobs across repeated discovery", async () => {
    const { token } = await registerUser();
    const first = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    const second = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const persisted = await Job.countDocuments({});
    expect(persisted).toBe(first.body.count);
  });

  test("discovery applies keyword filters", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({ keywords: "Frontend" });
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
    expect(
      res.body.jobs.every((j: { title: string }) =>
        j.title.toLowerCase().includes("frontend")
      )
    ).toBe(true);
  });

  test("discovery applies location filters", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({ locations: ["Seattle"] });
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
    expect(
      res.body.jobs.every((j: { locations: string[] }) =>
        j.locations.some((loc) => loc.toLowerCase().includes("seattle"))
      )
    ).toBe(true);
  });

  test("discovery applies remote and employment filters together", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({ remote: "remote", employmentType: "full-time" });
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
    expect(
      res.body.jobs.every(
        (j: { remoteType: string; employmentType: string }) =>
          j.remoteType === "remote" && j.employmentType === "full-time"
      )
    ).toBe(true);
  });

  test("rejects an invalid request body", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({ remote: "not-a-type" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Validation failed");
  });

  test("returns 503 when no job sources are configured", async () => {
    const { token } = await registerUser();
    jest.spyOn(require("../src/services/jobDiscovery"), "discoverJobs").mockRejectedValue(
      new (require("../src/middleware/errorHandler").AppError)("No job sources are configured", 503)
    );
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("No job sources are configured");
  });

  test("continues partial discovery when a job source fails", async () => {
    const { token } = await registerUser();
    const spy = jest
      .spyOn(require("../src/services/jobDiscovery"), "discoverJobs")
      .mockResolvedValueOnce({
        jobs: [],
        count: 0,
        sources: [
          { source: "broken", status: "error", message: "Job source failed" },
        ],
      });
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(spy).toHaveBeenCalled();
  });
});

describe("Jobs API - get single job", () => {
  test("requires authentication", async () => {
    const res = await request(app).get("/api/jobs/507f1f77bcf86cd799439011");
    expect(res.status).toBe(401);
  });

  test("returns a single job by id", async () => {
    const { token } = await registerUser();
    const created = await Job.create({
      ...mockJobBase,
      sourceJobId: "single",
      title: "Unique Job",
    });

    const res = await request(app)
      .get(`/api/jobs/${created._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.job._id).toBe(String(created._id));
    expect(res.body.job.title).toBe("Unique Job");
    expect(res.body.job).not.toHaveProperty("rawSource");
  });

  test("returns 404 for an unknown job id", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/jobs/507f1f77bcf86cd799439011")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test("returns 404 for inactive jobs", async () => {
    const { token } = await registerUser();
    const created = await Job.create({
      ...mockJobBase,
      sourceJobId: "inactive",
      title: "Inactive Job",
      isActive: false,
    });

    const res = await request(app)
      .get(`/api/jobs/${created._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
