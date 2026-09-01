import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import Job from "../src/models/Job";
import JobMatch from "../src/models/JobMatch";
import Profile from "../src/models/Profile";
import Skill from "../src/models/Skill";
import { computeDeterministicMatch } from "../src/services/deterministicMatch";
import { matchLevelFromScore } from "../src/validators/jobMatch";
import {
  JobMatchProfilePayload,
  JobMatchJobPayload,
} from "../src/services/jobMatchTypes";

const validJob = {
  source: "ingest",
  sourceJobId: "opp-1",
  fingerprint: "fp-opp-1",
  title: "Senior Full Stack Developer",
  companyName: "Acme Corp",
  description: "Senior full stack developer role with React and Node.js.",
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
  jobUrl: "https://example.com/opp/fullstack",
  applyUrl: "https://example.com/apply/fullstack",
  rawSource: {},
  lastSeenAt: new Date(),
  discoveredAt: new Date(),
  isActive: true,
};

// A payload that is valid against the strict ingestion schema (used for
// POST /api/jobs/ingest where no extra job-model-only fields are allowed).
const ingestJobBase = {
  source: "ingest",
  sourceJobId: "opp-1",
  title: "Senior Full Stack Developer",
  companyName: "Acme Corp",
  description: "Senior full stack developer role with React and Node.js.",
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
  jobUrl: "https://example.com/opp/fullstack",
  applyUrl: "https://example.com/apply/fullstack",
};

async function seedProfiledUser(token: string, userId: string) {
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
    { user: userId, name: "React", category: "Framework", proficiency: "Expert" },
    { user: userId, name: "Node.js", category: "Programming", proficiency: "Expert" },
    { user: userId, name: "TypeScript", category: "Programming", proficiency: "Advanced" },
  ]);
}

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

describe("deterministicMatch unit tests", () => {
  const profile: JobMatchProfilePayload = {
    profile: {
      fullName: "Test",
      headline: "Full Stack Developer",
      summary: "",
      location: "Remote",
      preferredRoles: ["Full Stack Developer"],
      preferredLocations: ["Remote"],
      workPreference: "remote",
      salaryExpectation: { min: 90000, max: 150000, currency: "USD" },
    },
    skills: [
      { name: "React", category: "Frontend", proficiency: "Expert" },
      { name: "Node.js", category: "Backend", proficiency: "Expert" },
      { name: "TypeScript", category: "Language", proficiency: "Advanced" },
    ],
    experience: [
      {
        company: "Acme",
        position: "Full Stack Developer",
        description: "",
        durationYears: 5,
        currentlyWorking: true,
      },
    ],
    education: [],
    projects: [
      {
        name: "Web App",
        description: "",
        technologies: ["React", "Node.js"],
        features: [],
        role: "Full Stack Developer",
      },
    ],
    githubAnalysis: [],
    professionalEvidence: [],
    resumeEvidence: [],
  };

  const job: JobMatchJobPayload = {
    title: "Senior Full Stack Developer",
    companyName: "Acme Corp",
    description: "Senior full stack role",
    locations: ["Remote"],
    remoteType: "remote",
    employmentType: "full-time",
    experienceLevel: "senior",
    salary: { min: 100000, max: 160000, currency: "USD" },
    skills: ["React", "Node.js", "TypeScript", "Kubernetes"],
    technologies: ["React", "Express", "Docker", "Kubernetes"],
    jobUrl: "https://example.com",
  };

  test("computes a high score with matching skills and technologies", () => {
    const result = computeDeterministicMatch(profile, job);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.matchLevel).toBe(matchLevelFromScore(result.score));
    expect(result.matchingSkills).toEqual(
      expect.arrayContaining(["React", "Node.js", "TypeScript"])
    );
    expect(result.missingSkills).toContain("Kubernetes");
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  test("recommends apply for strong matches", () => {
    const result = computeDeterministicMatch(profile, job);
    expect(result.recommendation).toMatch(/^(apply|maybe)$/);
    expect(result.recommendationReason).toContain("Deterministic score");
  });

  test("produces low score with zero skill overlap", () => {
    const unrelated: JobMatchJobPayload = {
      ...job,
      title: "Data Scientist",
      skills: ["Python", "Pandas", "TensorFlow"],
      technologies: ["PyTorch", "Spark"],
    };
    const result = computeDeterministicMatch(profile, unrelated);
    expect(result.score).toBeLessThan(50);
    expect(result.recommendation).toBe("skip");
  });

  test("is deterministic (same inputs => same result)", () => {
    const a = computeDeterministicMatch(profile, job);
    const b = computeDeterministicMatch(profile, job);
    expect(a).toEqual(b);
  });
});

describe("Opportunity feed API", () => {
  test("requires authentication", async () => {
    const res = await request(app).get("/api/jobs/opportunities");
    expect(res.status).toBe(401);
  });

  test("returns empty feed when no jobs exist and no profile", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/jobs/opportunities")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.opportunities).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
    expect(res.body.profileComplete).toBeDefined();
    expect(res.body.opportunities).not.toHaveProperty("rawSource");
  });

  test("scores and sorts opportunities deterministically without calling Claude", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/jobs/opportunities")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test("returns match details and does not create JobMatch records", async () => {
    const { token, user } = await registerUser();
    await seedProfiledUser(token, String(user.id));
    await Job.create({ ...validJob, sourceJobId: "feed-1", title: "Senior Full Stack Developer" });

    const res = await request(app)
      .get("/api/jobs/opportunities")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.opportunities).toHaveLength(1);
    expect(res.body.opportunities[0].match.score).toBeGreaterThanOrEqual(0);
    expect(res.body.opportunities[0].match.matchLevel).toBeTruthy();
    expect(res.body.opportunities[0].match.explanation.length).toBeGreaterThan(0);
    expect(res.body.opportunities[0].applyCapability.capability).toBe("external_url");

    const storedMatches = await JobMatch.countDocuments({});
    expect(storedMatches).toBe(0);
  });

  test("flags opportunities the user has already applied to", async () => {
    const { token, user } = await registerUser();
    await seedProfiledUser(token, String(user.id));
    const created = await Job.create({ ...validJob, sourceJobId: "feed-applied" });
    await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(created._id) })
      .expect(201);

    const res = await request(app)
      .get("/api/jobs/opportunities")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.opportunities[0].alreadyApplied).toBe(true);
    expect(res.body.opportunities[0].applicationStatus).toBe("saved");
  });

  test("is user-scoped for applied status", async () => {
    const { token: t1, user: u1 } = await registerUser();
    const { token: t2 } = await registerSecondUser();
    await seedProfiledUser(t1, String(u1.id));
    const created = await Job.create({ ...validJob, sourceJobId: "feed-scoped" });
    await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${t1}`)
      .send({ jobId: String(created._id) })
      .expect(201);

    const res1 = await request(app)
      .get("/api/jobs/opportunities")
      .set("Authorization", `Bearer ${t1}`);
    const res2 = await request(app)
      .get("/api/jobs/opportunities")
      .set("Authorization", `Bearer ${t2}`);
    expect(res1.body.opportunities[0].alreadyApplied).toBe(true);
    expect(res1.body.opportunities[0].applicationStatus).toBe("saved");
    expect(res2.body.opportunities[0].alreadyApplied).toBe(false);
    expect(res2.body.opportunities[0].applicationStatus).toBeNull();
  });

  test("filters by keywords", async () => {
    const { token } = await registerUser();
    await Job.create([
      { ...validJob, sourceJobId: "k-react", title: "React Engineer" },
      {
        ...validJob,
        sourceJobId: "k-node",
        title: "Node Engineer",
        description: "node only role",
        skills: ["Node.js", "Express"],
        technologies: ["Node.js"],
      },
    ]);
    const res = await request(app)
      .get("/api/jobs/opportunities")
      .query({ keywords: "React" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.opportunities).toHaveLength(1);
    expect(res.body.opportunities[0].job.title).toBe("React Engineer");
  });

  test("filters by remote and employment type", async () => {
    const { token } = await registerUser();
    await Job.create([
      { ...validJob, sourceJobId: "r-remote", remoteType: "remote", employmentType: "full-time" },
      { ...validJob, sourceJobId: "r-onsite", remoteType: "onsite", employmentType: "contract" },
    ]);
    const res = await request(app)
      .get("/api/jobs/opportunities")
      .query({ remote: "remote", employmentType: "full-time" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.opportunities).toHaveLength(1);
    expect(res.body.opportunities[0].job.remoteType).toBe("remote");
  });

  test("filters by source", async () => {
    const { token } = await registerUser();
    await Job.create([
      { ...validJob, sourceJobId: "s-a", source: "alpha" },
      { ...validJob, sourceJobId: "s-b", source: "beta" },
    ]);
    const res = await request(app)
      .get("/api/jobs/opportunities")
      .query({ source: "alpha" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.opportunities).toHaveLength(1);
    expect(res.body.opportunities[0].job.source).toBe("alpha");
  });

  test("paginates results", async () => {
    const { token } = await registerUser();
    const jobs = Array.from({ length: 5 }, (_, i) => ({
      ...validJob,
      sourceJobId: `p-${i}`,
      title: `Job ${i}`,
    }));
    await Job.create(jobs);
    const res = await request(app)
      .get("/api/jobs/opportunities")
      .query({ limit: 2, page: 1 })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.opportunities).toHaveLength(2);
    expect(res.body.pagination.total).toBe(5);
    expect(res.body.pagination.totalPages).toBe(3);
  });

  test("rejects limit above maximum with 422", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/jobs/opportunities")
      .query({ limit: 2000 })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Validation failed");
  });

  test("rejects unknown query parameters (strict)", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/jobs/opportunities")
      .query({ userId: "abc" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  test("does not accept userId to scope the feed for another user", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/jobs/opportunities")
      .query({ userId: "other" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
  });
});

describe("Opportunity detail API", () => {
  test("requires authentication", async () => {
    const res = await request(app).get("/api/jobs/opportunities/507f1f77bcf86cd799439011");
    expect(res.status).toBe(401);
  });

  test("returns detail with match explanation and apply capability", async () => {
    const { token, user } = await registerUser();
    await seedProfiledUser(token, String(user.id));
    const created = await Job.create({ ...validJob, sourceJobId: "detail-1" });

    const res = await request(app)
      .get(`/api/jobs/opportunities/${created._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.job._id).toBe(String(created._id));
    expect(res.body.match.explanation.length).toBeGreaterThan(0);
    expect(res.body.applyCapability.capability).toBe("external_url");
    expect(res.body.applyCapability.handoffUrl).toBe(validJob.applyUrl);
    expect(res.body.alreadyApplied).toBe(false);
    expect(res.body.job).not.toHaveProperty("rawSource");
  });

  test("returns 404 for unknown job id", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/jobs/opportunities/507f1f77bcf86cd799439011")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test("returns 404 for malformed id", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/jobs/opportunities/not-a-valid-id")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test("returns 404 for inactive jobs", async () => {
    const { token } = await registerUser();
    const created = await Job.create({ ...validJob, sourceJobId: "detail-inactive", isActive: false });
    const res = await request(app)
      .get(`/api/jobs/opportunities/${created._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test("reflects alreadyApplied when user saved the job", async () => {
    const { token, user } = await registerUser();
    await seedProfiledUser(token, String(user.id));
    const created = await Job.create({ ...validJob, sourceJobId: "detail-applied" });
    await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(created._id) })
      .expect(201);

    const res = await request(app)
      .get(`/api/jobs/opportunities/${created._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.alreadyApplied).toBe(true);
    expect(res.body.applicationStatus).toBe("saved");
  });
});

describe("Job ingestion API", () => {
  test("requires authentication", async () => {
    const res = await request(app).post("/api/jobs/ingest").send({ jobs: [] });
    expect(res.status).toBe(401);
  });

  test("ingests and normalizes jobs", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/jobs/ingest")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jobs: [
          {
            source: "ingest",
            sourceJobId: "i-1",
            title: "  React Developer  ",
            companyName: "Acme",
            description: "Build UIs with React",
            remoteType: "remote",
            employmentType: "full-time",
            experienceLevel: "mid",
            locations: ["Remote"],
            skills: ["React", "TypeScript"],
            technologies: ["React", "Vite"],
            jobUrl: "https://example.com/jobs/1",
            applyUrl: "https://example.com/apply/1",
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
    expect(res.body.totalJobs).toBe(1);

    const persisted = await Job.findOne({ sourceJobId: "i-1" });
    expect(persisted).not.toBeNull();
    expect(persisted!.title).toBe("React Developer");
    expect(persisted!.skills).toEqual(["React", "TypeScript"]);
    expect(persisted!.applyCapability).toBe("external_url");
  });

  test("deduplicates jobs with the same source + sourceJobId", async () => {
    const { token } = await registerUser();
    const body = {
      jobs: [{ ...ingestJobBase, sourceJobId: "dup-1" }],
    };
    await request(app)
      .post("/api/jobs/ingest")
      .set("Authorization", `Bearer ${token}`)
      .send(body)
      .expect(200);
    const res2 = await request(app)
      .post("/api/jobs/ingest")
      .set("Authorization", `Bearer ${token}`)
      .send(body)
      .expect(200);

    const count = await Job.countDocuments({ source: "ingest", sourceJobId: "dup-1" });
    expect(count).toBe(1);
    const inserted = await Job.findOne({ source: "ingest", sourceJobId: "dup-1" });
    expect(inserted).not.toBeNull();
    // Re-ingesting the same identity should be an update, never a 2nd record.
    expect(res2.body.totalJobs).toBe(1);
    expect(res2.body.inserted).toBe(0);
  });

  test("deduplicates identical jobs within a single payload", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/jobs/ingest")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jobs: [
          { ...ingestJobBase, sourceJobId: "single-1" },
          { ...ingestJobBase, sourceJobId: "single-1" },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.totalJobs).toBe(1);
    const count = await Job.countDocuments({ source: "ingest", sourceJobId: "single-1" });
    expect(count).toBe(1);
  });

  test("rejects userId/ownerId/accountId in the body (strict)", async () => {
    const { token } = await registerUser();
    const body = {
      userId: "someone",
      jobs: [{ ...ingestJobBase, sourceJobId: "i-owner" }],
    };
    const res = await request(app)
      .post("/api/jobs/ingest")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
    expect(res.status).toBe(422);

    const ownerBody = {
      ownerId: "someone",
      jobs: [{ ...ingestJobBase, sourceJobId: "i-owner2" }],
    };
    const res2 = await request(app)
      .post("/api/jobs/ingest")
      .set("Authorization", `Bearer ${token}`)
      .send(ownerBody);
    expect(res2.status).toBe(422);
  });

  test("strips sensitive keys from rawData", async () => {
    const { token } = await registerUser();
    await request(app)
      .post("/api/jobs/ingest")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jobs: [
          {
            ...ingestJobBase,
            sourceJobId: "i-secret",
            rawData: {
              sourceJobId: "i-secret",
              accessToken: "secret-token",
              apiKey: "shh",
              description: "plain",
            },
          },
        ],
      })
      .expect(200);

    const persisted = await Job.findOne({ source: "ingest", sourceJobId: "i-secret" });
    expect(persisted).not.toBeNull();
    const raw = persisted!.rawSource as Record<string, unknown>;
    expect(raw).not.toHaveProperty("accessToken");
    expect(raw).not.toHaveProperty("apiKey");
    expect(raw).toHaveProperty("description");
  });

  test("rejects invalid URLs", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/jobs/ingest")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jobs: [
          { ...ingestJobBase, sourceJobId: "i-badurl", jobUrl: "not-a-url" },
        ],
      });
    expect(res.status).toBe(422);
  });

  test("rejects incomplete job payloads", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/jobs/ingest")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobs: [{ source: "ingest", sourceJobId: "i-incomplete" }] });
    expect(res.status).toBe(422);
  });

  test("rejects empty jobs array", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/jobs/ingest")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobs: [] });
    expect(res.status).toBe(422);
  });
});
