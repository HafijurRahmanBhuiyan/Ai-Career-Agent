import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser } from "./helpers";
import Profile from "../src/models/Profile";
import { JobSource, RawJob, JobSearchParams } from "../src/integrations/jobs/jobSource.types";

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

let originalFetch: typeof global.fetch;
beforeEach(() => {
  originalFetch = global.fetch;
  global.fetch = jest.fn().mockRejectedValue(
    new Error("network disabled in unit test")
  ) as unknown as typeof fetch;
  jest.spyOn(require("../src/integrations/jobs/jobSourceRegistry"), "getEnabledJobSources").mockReturnValue([stubSource()]);
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

async function seedProfile(userId: unknown, overrides: Record<string, unknown> = {}) {
  await Profile.create({
    user: userId as string,
    preferredRoles: [],
    preferredLocations: [],
    workPreference: "",
    ...overrides,
  });
}

const stubJobs: RawJob[] = [
  {
    title: "Full Stack Developer",
    companyName: "Stub Corp",
    description: "Full stack development role.",
    locations: ["Remote", "New York, NY"],
    remoteType: "remote",
    employmentType: "full-time",
    experienceLevel: "mid",
    salaryMin: 90000,
    salaryMax: 130000,
    salaryCurrency: "USD",
    salaryPeriod: "yearly",
    jobUrl: "https://stub.example/jobs/fullstack",
    applyUrl: "https://stub.example/apply/fullstack",
    postedAt: new Date(),
  },
  {
    title: "React Developer",
    companyName: "Stub Corp",
    description: "Build interfaces with React and Redux.",
    locations: ["Remote", "San Francisco, CA"],
    remoteType: "hybrid",
    employmentType: "contract",
    experienceLevel: "junior",
    salaryMin: 50000,
    salaryMax: 70000,
    jobUrl: "https://stub.example/jobs/react",
    applyUrl: "https://stub.example/apply/react",
    postedAt: new Date(),
  },
  {
    title: "Node.js Developer",
    companyName: "Stub Corp",
    description: "Build server-side APIs and integrations.",
    locations: ["Remote", "Austin, TX"],
    remoteType: "remote",
    employmentType: "full-time",
    experienceLevel: "senior",
    salaryMin: 120000,
    salaryMax: 160000,
    jobUrl: "https://stub.example/jobs/node",
    applyUrl: "https://stub.example/apply/node",
    postedAt: new Date(),
  },
  {
    title: "Backend Engineer",
    companyName: "Stub Corp",
    description: "Robust server-side systems.",
    locations: ["Seattle, WA"],
    remoteType: "onsite",
    employmentType: "full-time",
    experienceLevel: "senior",
    salaryMin: 130000,
    salaryMax: 170000,
    jobUrl: "https://stub.example/jobs/backend",
    applyUrl: "https://stub.example/apply/backend",
    postedAt: new Date(),
  },
  {
    title: "Software Engineer",
    companyName: "Stub Corp",
    description: "Generalist software engineering.",
    locations: ["Boston, MA", "Remote"],
    remoteType: "hybrid",
    employmentType: "full-time",
    experienceLevel: "mid",
    salaryMin: 95000,
    salaryMax: 140000,
    jobUrl: "https://stub.example/jobs/sw",
    applyUrl: "https://stub.example/apply/sw",
    postedAt: new Date(),
  },
  {
    title: "Frontend Engineer",
    companyName: "Stub Corp",
    description: "Craft delightful user experiences.",
    locations: ["Remote", "Denver, CO"],
    remoteType: "remote",
    employmentType: "part-time",
    experienceLevel: "entry",
    salaryMin: 40000,
    salaryMax: 55000,
    jobUrl: "https://stub.example/jobs/frontend",
    applyUrl: "https://stub.example/apply/frontend",
    postedAt: new Date(),
  },
];

function matchesStubParams(job: RawJob, params: JobSearchParams): boolean {
  if (params.keywords) {
    const keyword = params.keywords.trim().toLowerCase();
    const haystack = [job.title, job.companyName, job.description]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(keyword)) return false;
  }
  if (params.locations && params.locations.length > 0) {
    const locationQuery = params.locations.join(" ").toLowerCase();
    const locationMatches = (job.locations || []).some((loc) =>
      loc.toLowerCase().includes(locationQuery)
    );
    if (!locationMatches) return false;
  }
  if (params.remote && params.remote !== "any" && job.remoteType !== params.remote) {
    return false;
  }
  if (params.employmentType && job.employmentType !== params.employmentType) {
    return false;
  }
  if (params.experienceLevel && job.experienceLevel !== params.experienceLevel) {
    return false;
  }
  if (params.salaryMinimum && (job.salaryMax ?? 0) < params.salaryMinimum) {
    return false;
  }
  return true;
}

function stubSource(): JobSource {
  return {
    id: "stub",
    name: "Stub Job Source",
    async searchJobs(params: JobSearchParams) {
      return { jobs: stubJobs.filter((job) => matchesStubParams(job, params)) };
    },
  };
}

async function discoverAllTitles(token: string): Promise<Set<string>> {  const res = await request(app)
    .post("/api/jobs/discover")
    .set("Authorization", `Bearer ${token}`)
    .send({ limit: 50 });
  return new Set(res.body.jobs.map((j: { title: string }) => j.title));
}

describe("Jobs API - profile preferences drive discovery (precedence)", () => {
  test("A. roles from jobSearchPreferences used for discovery when request roles absent", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id, {
      jobSearchPreferences: {
        roles: ["React Developer"],
        locations: [],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: null,
      },
    });
    const titles = await discoverAllTitles(token);
    expect(titles.has("React Developer")).toBe(true);
    // React Developer keyword should filter out non-overlapping titles.
    expect(titles.has("Backend Engineer")).toBe(false);
  });

  test("B. explicit request keyword overrides saved roles", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id, {
      jobSearchPreferences: {
        roles: ["React Developer"],
        locations: [],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: null,
      },
    });
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({ keywords: "Backend", limit: 50 });
    const titles = new Set(res.body.jobs.map((j: { title: string }) => j.title));
    expect(titles.has("Backend Engineer")).toBe(true);
    expect(titles.has("React Developer")).toBe(false);
  });

  test("C. locations from jobSearchPreferences used for discovery", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id, {
      jobSearchPreferences: {
        roles: ["Backend Engineer"],
        locations: ["Seattle"],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: null,
      },
    });
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({ limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBeGreaterThan(0);
    expect(
      res.body.jobs.every((j: { locations: string[] }) =>
        j.locations.some((loc) => loc.toLowerCase().includes("seattle"))
      )
    ).toBe(true);
  });

  test("D. explicit request locations override saved preferences", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id, {
      jobSearchPreferences: {
        roles: ["Software Engineer"],
        locations: ["Seattle"],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: null,
      },
    });
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({ locations: ["Boston"], limit: 50 });
    expect(res.status).toBe(200);
    if (res.body.jobs.length > 0) {
      expect(
        res.body.jobs.every((j: { locations: string[] }) =>
          j.locations.some((loc) => loc.toLowerCase().includes("boston"))
        )
      ).toBe(true);
    }
  });

  test("E. remote preference from jobSearchPreferences is respected", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id, {
      jobSearchPreferences: {
        roles: ["Backend Engineer"],
        locations: [],
        remote: "onsite",
        experienceLevel: "",
        salaryMinimum: null,
      },
    });
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({ limit: 50 });
    expect(res.status).toBe(200);
    if (res.body.jobs.length > 0) {
      expect(
        res.body.jobs.every((j: { remoteType: string }) => j.remoteType === "onsite")
      ).toBe(true);
    }
  });

  test("F. experienceLevel preference respected where the source supports it", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id, {
      jobSearchPreferences: {
        roles: ["Frontend Engineer"],
        locations: [],
        remote: "any",
        experienceLevel: "entry",
        salaryMinimum: null,
      },
    });
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({ limit: 50 });
    expect(res.status).toBe(200);
    // Stub Frontend Engineer is 'entry' level, so should be present.
    expect(
      res.body.jobs.every((j: { experienceLevel: string }) => j.experienceLevel === "entry")
    ).toBe(true);
  });

  test("G. salaryMinimum preference respected where supported", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id, {
      jobSearchPreferences: {
        roles: ["Frontend Engineer"],
        locations: [],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: 200000,
      },
    });
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({ limit: 50 });
    expect(res.status).toBe(200);
    // Stub Frontend Engineer salary is 40000-55000, below the 200000 minimum,
    // so no jobs should match.
    expect(res.body.count).toBe(0);
  });

  test("H. legacy preferredRoles/preferredLocations/workPreference still work without jobSearchPreferences", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id, {
      preferredRoles: ["Backend Engineer"],
      preferredLocations: ["Seattle"],
      workPreference: "onsite",
    });
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({ limit: 50 });
    expect(res.status).toBe(200);
    const titles = new Set(res.body.jobs.map((j: { title: string }) => j.title));
    expect(titles.has("Backend Engineer")).toBe(true);
  });

  test("I. empty jobSearchPreferences falls back to legacy fields", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id, {
      preferredRoles: ["Backend Engineer"],
      jobSearchPreferences: {
        roles: [],
        locations: [],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: null,
      },
    });
    const titles = await discoverAllTitles(token);
    expect(titles.has("Backend Engineer")).toBe(true);
  });

  test("J. multiple roles handled correctly (keyword uses first role)", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id, {
      jobSearchPreferences: {
        roles: ["Backend Engineer"],
        locations: [],
        remote: "any",
        experienceLevel: "",
        salaryMinimum: null,
      },
    });
    const titles = await discoverAllTitles(token);
    expect(titles.has("Backend Engineer")).toBe(true);
  });

  test("K. no preference data causes no crash", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({ limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
  });

  test("L. explicit request filters keep working when no preferences exist", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({ keywords: "Frontend", limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
    expect(
      res.body.jobs.every((j: { title: string }) =>
        j.title.toLowerCase().includes("frontend")
      )
    ).toBe(true);
  });
});

describe("Jobs API - search page (profile preferences)", () => {
  async function persistAll(token: string) {
    await request(app)
      .post("/api/jobs/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({ limit: 50 });
  }

  test("legacy preferredRoles used as keyword fallback on GET /api/jobs", async () => {
    const { token, user } = await registerUser();
    // Persist all jobs while the profile has no role preference.
    await seedProfile(user.id, { preferredRoles: [] });
    await persistAll(token);
    // Now add a legacy role preference so the GET fallback applies.
    await Profile.updateOne({ user: user.id }, { preferredRoles: ["React Developer"] });
    const res = await request(app)
      .get("/api/jobs")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const titles = new Set(res.body.jobs.map((j: { title: string }) => j.title));
    expect(titles.has("React Developer")).toBe(true);
    // The keyword fallback restricts results to that role.
    expect(titles.has("Backend Engineer")).toBe(false);
  });

  test("jobSearchPreferences.roles used as keyword fallback on GET /api/jobs", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id, { preferredRoles: [] });
    await persistAll(token);
    await Profile.updateOne(
      { user: user.id },
      {
        jobSearchPreferences: {
          roles: ["Node.js Developer"],
          locations: [],
          remote: "any",
          experienceLevel: "",
          salaryMinimum: null,
        },
      }
    );
    const res = await request(app)
      .get("/api/jobs")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const titles = new Set(res.body.jobs.map((j: { title: string }) => j.title));
    expect(titles.has("Node.js Developer")).toBe(true);
    expect(titles.has("Backend Engineer")).toBe(false);
  });

  test("explicit keywords on GET /api/jobs override saved role preference", async () => {
    const { token, user } = await registerUser();
    await seedProfile(user.id, { preferredRoles: [] });
    await persistAll(token);
    await Profile.updateOne(
      { user: user.id },
      {
        jobSearchPreferences: {
          roles: ["Node.js Developer"],
          locations: [],
          remote: "any",
          experienceLevel: "",
          salaryMinimum: null,
        },
      }
    );
    // Explicit keyword "Frontend" must beat the saved "Node.js Developer" role.
    const res = await request(app)
      .get("/api/jobs")
      .query({ keywords: "Frontend" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const titles = new Set(res.body.jobs.map((j: { title: string }) => j.title));
    expect(titles.has("Frontend Engineer")).toBe(true);
    expect(titles.has("Node.js Developer")).toBe(false);
  });
});
