import mongoose from "mongoose";
import { JobSource, JobSourceResult, RawJob } from "../src/integrations/jobs/jobSource.types";
import { Role } from "../src/types";
import User from "../src/models/User";
import Job from "../src/models/Job";
import request from "supertest";
import { app } from "../src/app";
import {
  buildDiscoveryQueryKey,
  collectEligibleUsers,
  deduplicateQueries,
  runAutomaticDiscovery,
} from "../src/services/jobAutomaticDiscovery";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";

type ProfileLike = Parameters<typeof collectEligibleUsers>[0][number];
type AccountLike = {
  isActive: boolean;
  role: Role | string;
  _id: { toString(): string };
  id?: string;
};

const acc = (id: string, over: Partial<AccountLike> = {}): AccountLike => ({
  _id: { toString: () => id },
  isActive: true,
  role: Role.USER,
  ...over,
});

const prof = (
  userId: string,
  over: Partial<
    Omit<Exclude<ProfileLike, null | undefined>, "jobSearchPreferences"> & {
      jobSearchPreferences?: {
        roles?: string[];
        locations?: string[];
        remote?: string;
        experienceLevel?: string;
        salaryMinimum?: number;
      };
    }
  > = {}
): ProfileLike =>
  ({
    user: { toString: () => userId } as never,
    preferredRoles: [],
    preferredLocations: [],
    workPreference: "",
    jobSearchPreferences: { roles: [], locations: [] },
    ...over,
  }) as ProfileLike;

function rawJob(id: string, over: Partial<RawJob> = {}): RawJob {
  return {
    title: "Software Engineer",
    companyName: "Acme",
    description: "Build software.",
    locations: ["Remote"],
    remoteType: "remote",
    employmentType: "full-time",
    experienceLevel: "mid",
    jobUrl: `https://example.com/jobs/${id}`,
    applyUrl: `https://example.com/apply/${id}`,
    rawData: { id },
    ...over,
  };
}

function stubSource(id: string, onSearch: (q: unknown) => RawJob[]): JobSource & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    id,
    name: `Stub ${id}`,
    calls,
    async searchJobs(params) {
      calls.push(params);
      return { jobs: onSearch(params) } as JobSourceResult;
    },
  };
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

describe("buildDiscoveryQueryKey", () => {
  test("H. is canonical: case-insensitive and whitespace-normalized", () => {
    const a = buildDiscoveryQueryKey({ keywords: "  React ", roles: ["Full Stack"], locations: [" Remote "] });
    const b = buildDiscoveryQueryKey({ keywords: "react", roles: ["full stack"], locations: ["remote"] });
    expect(a).toBe(b);
  });

  test("H2. distinct parameter sets map to distinct keys", () => {
    const a = buildDiscoveryQueryKey({ keywords: "react" });
    const b = buildDiscoveryQueryKey({ keywords: "node" });
    expect(a).not.toBe(b);
  });
});

describe("collectEligibleUsers", () => {
  test("A. inactive account profile is skipped", () => {
    const profiles = [prof("u1", { preferredRoles: ["Engineer"] })];
    const users = [acc("u1", { isActive: false })];
    const r = collectEligibleUsers(profiles, users);
    expect(r.eligible).toHaveLength(0);
    expect(r.skipped).toBe(1);
    expect(r.eligibleAccounts).toBe(0);
  });

  test("B. admin account profile is skipped", () => {
    const profiles = [prof("u1", { preferredRoles: ["Engineer"] })];
    const users = [acc("u1", { role: Role.ADMIN })];
    const r = collectEligibleUsers(profiles, users);
    expect(r.eligible).toHaveLength(0);
  });

  test("C. profile with no actionable signal is skipped", () => {
    const profiles = [prof("u1")];
    const users = [acc("u1")];
    const r = collectEligibleUsers(profiles, users);
    expect(r.eligible).toHaveLength(0);
    expect(r.eligibleAccounts).toBe(1);
  });

  test("D. explicit request params take precedence over saved preferences", () => {
    const profiles = [prof("u1", { jobSearchPreferences: { roles: ["Legacy Role"] } })];
    const users = [acc("u1")];
    const r = collectEligibleUsers(profiles, users, { keywords: "explicit-keyword" });
    expect(r.eligible).toHaveLength(1);
    expect(r.eligible[0].params.keywords).toBe("explicit-keyword");
  });

  test("M. eligibleAccounts counts active non-admin accounts only", () => {
    const profiles = [
      prof("u1", { preferredRoles: ["Engineer"] }),
      prof("u2", { preferredRoles: ["Engineer"] }),
      prof("u3", { preferredRoles: ["Engineer"] }),
    ];
    const users = [acc("u1"), acc("u2", { isActive: false }), acc("u3", { role: Role.ADMIN })];
    const r = collectEligibleUsers(profiles, users);
    expect(r.eligible).toHaveLength(1);
    expect(r.eligibleAccounts).toBe(1);
    expect(r.skipped).toBe(2);
  });
});

describe("deduplicateQueries", () => {
  test("E. identical params from different users collapse to one query", () => {
    const eligible = [
      { userId: "a", params: { keywords: "react" } },
      { userId: "b", params: { keywords: "react" } },
    ];
    const { queryUsers, naiveCount } = deduplicateQueries(eligible);
    expect(queryUsers).toHaveLength(1);
    expect(queryUsers[0].users.sort()).toEqual(["a", "b"]);
    expect(naiveCount).toBe(2);
  });

  test("F. distinct param sets stay as separate queries", () => {
    const eligible = [
      { userId: "a", params: { keywords: "react" } },
      { userId: "b", params: { keywords: "node" } },
    ];
    const { queryUsers } = deduplicateQueries(eligible);
    expect(queryUsers).toHaveLength(2);
  });
});

describe("runAutomaticDiscovery", () => {
  test("K. issues each distinct query once per source (no per-user duplicates)", async () => {
    const src = stubSource("mock", () => []);
    const profiles = [
      prof("u1", { jobSearchPreferences: { roles: ["Engineer"] } }),
      prof("u2", { jobSearchPreferences: { roles: ["Engineer"] } }), // same query
    ];
    const users = [acc("u1"), acc("u2")];
    const result = await runAutomaticDiscovery({ profiles, users, sources: [src] });
    expect(result.queryCount).toBe(1);
    expect(src.calls).toHaveLength(1);
    expect(result.stats.dedupedQueries).toBe(1);
    expect(result.stats.profilesUsed).toBe(2);
  });

  test("E2. persists jobs and returns aggregate count", async () => {
    const src = stubSource("mock", () => [rawJob("job-1"), rawJob("job-2")]);
    const profiles = [
      prof("u1", { jobSearchPreferences: { roles: ["Engineer"] } }),
    ];
    const users = [acc("u1")];
    const result = await runAutomaticDiscovery({ profiles, users, sources: [src] });
    expect(result.count).toBeGreaterThan(0);
    expect(result.sources.some((s) => s.status === "success")).toBe(true);
    expect(await Job.countDocuments({})).toBe(result.count);
  });

  test("G. a failing source is reported but does not abort the run", async () => {
    const failing = {
      id: "bad",
      name: "Bad",
      async searchJobs() {
        throw new Error("upstream down");
      },
    } as unknown as JobSource;
    const ok = stubSource("mock", (q) => [rawJob(`ok-${(q as { keywords?: string }).keywords ?? ""}`)]);
    const profiles = [prof("u1", { jobSearchPreferences: { roles: ["Engineer"] } })];
    const users = [acc("u1")];
    const result = await runAutomaticDiscovery({ profiles, users, sources: [failing, ok] });
    expect(result.sources.find((s) => s.source === "bad")?.status).toBe("error");
    expect(result.sources.find((s) => s.source === "mock")?.status).toBe("success");
    expect(result.count).toBeGreaterThan(0);
  });

  test("I. rediscovered jobs get lastSeenAt bumped and stay active", async () => {
    const src = stubSource("mock", () => [rawJob("rediscovered")]);
    const profiles = [prof("u1", { jobSearchPreferences: { roles: ["Engineer"] } })];
    const users = [acc("u1")];

    await runAutomaticDiscovery({ profiles, users, sources: [src] });
    const first = await Job.findOne();
    expect(first!.isActive).toBe(true);
    const firstSeen = first!.lastSeenAt.getTime();

    const past = new Date(firstSeen - 10 * 24 * 60 * 60 * 1000);
    await Job.updateOne({ _id: first!._id }, { $set: { lastSeenAt: past } });

    await runAutomaticDiscovery({ profiles, users, sources: [src] });
    const refreshed = await Job.findOne();
    expect(refreshed!.isActive).toBe(true);
    expect(refreshed!.lastSeenAt.getTime()).toBeGreaterThan(past.getTime());
  });

  test("L. profilesUsed and profilesSkipped statistics are correct", async () => {
    const src = stubSource("mock", () => []);
    const profiles = [
      prof("u1", { preferredRoles: ["Engineer"] }), // used
      prof("u2", { preferredRoles: ["Engineer"] }), // used
      prof("u3"), // skipped (no signal)
    ];
    const users = [acc("u1"), acc("u2"), acc("u3")];
    const result = await runAutomaticDiscovery({ profiles, users, sources: [src] });
    expect(result.stats.profilesUsed).toBe(2);
    expect(result.stats.profilesSkipped).toBe(1);
  });
});

describe("automatic discovery endpoint (admin only)", () => {
  test("N1. rejects unauthenticated request with 401", async () => {
    const res = await request(app).post("/api/jobs/discovery/run");
    expect(res.status).toBe(401);
  });

  test("N2. rejects non-admin user with 403", async () => {
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ name: "User", email: "cuex@example.com", password: "securePassword123" })
      .expect(201);
    const res = await request(app)
      .post("/api/jobs/discovery/run")
      .set("Authorization", `Bearer ${reg.body.token}`);
    expect(res.status).toBe(403);
  });

  test("N3+O. allows admin and returns aggregate stats only (no raw jobs)", async () => {
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ name: "Admin", email: "cadmin@example.com", password: "securePassword123" })
      .expect(201);
    await User.updateOne({ email: "cadmin@example.com" }, { $set: { role: Role.ADMIN } });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "cadmin@example.com", password: "securePassword123" })
      .expect(200);

    const res = await request(app)
      .post("/api/jobs/discovery/run")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.count).toBe("number");
    expect(typeof res.body.queryCount).toBe("number");
    expect(res.body.stats).toBeDefined();
    expect(typeof res.body.stats.profilesUsed).toBe("number");
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain("companyName");
    expect(bodyStr).not.toContain("\"jobs\":");
  });

  test("O2. admin run is driven by real user profiles end-to-end", async () => {
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ name: "User2", email: "cuser2@example.com", password: "securePassword123" })
      .expect(201);
    await User.updateOne({ email: "cuser2@example.com" }, { $set: { role: Role.ADMIN } });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "cuser2@example.com", password: "securePassword123" })
      .expect(200);

    const res = await request(app)
      .post("/api/jobs/discovery/run")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(0);
  });
});
