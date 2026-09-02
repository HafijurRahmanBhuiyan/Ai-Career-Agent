import Job from "../src/models/Job";
import User from "../src/models/User";
import request from "supertest";
import { app } from "../src/app";
import { Role } from "../src/types";
import {
  deactivateStaleJobs,
  getJobStaleDays,
  JOB_STALE_DAYS_DEFAULT,
} from "../src/services/jobMaintenance";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";

const DAY_MS = 24 * 60 * 60 * 1000;

const baseJob = {
  source: "mock",
  sourceJobId: "maint",
  fingerprint: "fp-maint",
  title: "Engineer",
  companyName: "Acme",
  description: "A role.",
  locations: ["Remote"],
  remoteType: "remote" as const,
  employmentType: "full-time" as const,
  experienceLevel: "mid" as const,
  skills: ["Node.js"],
  technologies: ["Express"],
  isActive: true,
  lastSeenAt: new Date(),
  discoveredAt: new Date(),
};

async function seedJob(overrides: Record<string, unknown> = {}) {
  return Job.create({
    ...baseJob,
    sourceJobId: `maint-${Date.now()}-${Math.random()}`,
    ...overrides,
  });
}

// Fixed reference time in the middle of the run to keep the test fully
// deterministic (no dependence on the real wall clock).
const REF = new Date("2030-06-15T12:00:00.000Z");

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

describe("getJobStaleDays", () => {
  test("J. defaults when environment variable is absent", () => {
    expect(getJobStaleDays({})).toBe(JOB_STALE_DAYS_DEFAULT);
  });

  test("I. respects a configured JOB_STALE_DAYS", () => {
    expect(getJobStaleDays({ JOB_STALE_DAYS: "5" })).toBe(5);
    expect(getJobStaleDays({ JOB_STALE_DAYS: "30" })).toBe(30);
  });

  test("M. ignores invalid configuration (no NaN/0)", () => {
    expect(getJobStaleDays({ JOB_STALE_DAYS: "abc" })).toBe(JOB_STALE_DAYS_DEFAULT);
    expect(getJobStaleDays({ JOB_STALE_DAYS: "0" })).toBe(JOB_STALE_DAYS_DEFAULT);
    expect(getJobStaleDays({ JOB_STALE_DAYS: "-3" })).toBe(JOB_STALE_DAYS_DEFAULT);
  });
});

describe("deactivateStaleJobs", () => {
  test("A. active job older than cutoff -> deactivated", async () => {
    await seedJob({ lastSeenAt: new Date(REF.getTime() - 30 * DAY_MS) });
    const result = await deactivateStaleJobs({ now: REF });
    expect(result.deactivated).toBe(1);
    expect(result.evaluated).toBe(1);
    const doc = await Job.findOne();
    expect(doc!.isActive).toBe(false);
  });

  test("B. active job newer than cutoff -> remains active", async () => {
    await seedJob({ lastSeenAt: new Date(REF.getTime() - DAY_MS) });
    const result = await deactivateStaleJobs({ now: REF, env: { JOB_STALE_DAYS: "14" } });
    expect(result.deactivated).toBe(0);
    const doc = await Job.findOne();
    expect(doc!.isActive).toBe(true);
  });

  test("D. lastSeenAt exactly at cutoff -> treated as fresh, remains active", async () => {
    await seedJob({ lastSeenAt: new Date(REF.getTime() - 14 * DAY_MS) });
    const result = await deactivateStaleJobs({ now: REF, env: { JOB_STALE_DAYS: "14" } });
    expect(result.deactivated).toBe(0);
    const doc = await Job.findOne();
    expect(doc!.isActive).toBe(true);
  });

  test("C. already-inactive job older than cutoff -> unchanged", async () => {
    await seedJob({ lastSeenAt: new Date(REF.getTime() - 60 * DAY_MS), isActive: false });
    const result = await deactivateStaleJobs({ now: REF });
    expect(result.deactivated).toBe(0);
    const doc = await Job.findOne();
    expect(doc!.isActive).toBe(false);
  });

  test("E. multiple stale jobs -> correct deactivation count", async () => {
    await seedJob({ lastSeenAt: new Date(REF.getTime() - 40 * DAY_MS) });
    await seedJob({ lastSeenAt: new Date(REF.getTime() - 20 * DAY_MS) });
    const result = await deactivateStaleJobs({ now: REF });
    expect(result.evaluated).toBe(2);
    expect(result.deactivated).toBe(2);
    const activeCount = await Job.countDocuments({ isActive: true });
    expect(activeCount).toBe(0);
  });

  test("F. mixed stale/fresh/inactive -> only stale active jobs changed", async () => {
    // Two stale active, one fresh active, one already-inactive.
    await seedJob({ lastSeenAt: new Date(REF.getTime() - 30 * DAY_MS) });
    await seedJob({ lastSeenAt: new Date(REF.getTime() - 25 * DAY_MS) });
    await seedJob({ lastSeenAt: new Date(REF.getTime() - 1 * DAY_MS) });
    await seedJob({ lastSeenAt: new Date(REF.getTime() - 60 * DAY_MS), isActive: false });

    const result = await deactivateStaleJobs({ now: REF });
    expect(result.evaluated).toBe(2);
    expect(result.deactivated).toBe(2);

    // Exactly the two stale-active jobs are now inactive; the fresh one stays
    // active and the pre-inactive one remains inactive.
    const active = await Job.find({ isActive: true });
    expect(active).toHaveLength(1);
    expect(active[0]!.lastSeenAt.getTime()).toBe(REF.getTime() - 1 * DAY_MS);
  });

  test("G. missing/null lastSeenAt -> NOT deactivated", async () => {
    // Seed one doc without lastSeenAt (null).
    await seedJob({ lastSeenAt: null });
    const result = await deactivateStaleJobs({ now: REF });
    expect(result.evaluated).toBe(0);
    expect(result.deactivated).toBe(0);
    const doc = await Job.findOne();
    expect(doc!.isActive).toBe(true);
  });

  test("H. running cleanup twice -> idempotent", async () => {
    await seedJob({ lastSeenAt: new Date(REF.getTime() - 30 * DAY_MS) });
    const first = await deactivateStaleJobs({ now: REF });
    const second = await deactivateStaleJobs({ now: REF });
    expect(first.deactivated).toBe(1);
    expect(second.deactivated).toBe(0);
    const doc = await Job.findOne();
    expect(doc!.isActive).toBe(false);
  });

  test("L. recently rediscovered job remains active", async () => {
    // Simulate a job just seen by discovery: lastSeenAt = now.
    await seedJob({ lastSeenAt: new Date(REF.getTime()) });
    const result = await deactivateStaleJobs({ now: REF });
    expect(result.deactivated).toBe(0);
    const doc = await Job.findOne();
    expect(doc!.isActive).toBe(true);
  });

  test("I. configured JOB_STALE_DAYS is respected", async () => {
    // A job seen 10 days ago: stale with 7-day window, fresh with 30-day window.
    await seedJob({ lastSeenAt: new Date(REF.getTime() - 10 * DAY_MS) });
    const short = await deactivateStaleJobs({ now: REF, env: { JOB_STALE_DAYS: "7" } });
    expect(short.deactivated).toBe(1);

    await clearTestDB();
    await seedJob({ lastSeenAt: new Date(REF.getTime() - 10 * DAY_MS) });
    const long = await deactivateStaleJobs({ now: REF, env: { JOB_STALE_DAYS: "30" } });
    expect(long.deactivated).toBe(0);
  });

  test("M. default cutoff calculation is finite and sane", async () => {
    const result = await deactivateStaleJobs({ now: REF, env: {} });
    expect(Number.isFinite(result.cutoff.getTime())).toBe(true);
    expect(result.staleDays).toBe(JOB_STALE_DAYS_DEFAULT);
    expect(result.cutoff.getTime()).toBe(REF.getTime() - JOB_STALE_DAYS_DEFAULT * DAY_MS);
  });

  test("K. no job/history data is deleted", async () => {
    await seedJob({ lastSeenAt: new Date(REF.getTime() - 30 * DAY_MS) });
    await deactivateStaleJobs({ now: REF });
    // The document still exists, just inactive; content untouched.
    const total = await Job.countDocuments({});
    expect(total).toBe(1);
    const doc = await Job.findOne();
    expect(doc!.title).toBe("Engineer");
    expect(doc!.companyName).toBe("Acme");
    expect(doc!.description).toBe("A role.");
    expect(doc!.lastSeenAt.getTime()).toBe(REF.getTime() - 30 * DAY_MS);
  });
});

describe("maintenance endpoint (admin only)", () => {
  test("rejects unauthenticated request with 401", async () => {
    const res = await request(app).post("/api/jobs/maintenance/stale");
    expect(res.status).toBe(401);
  });

  test("rejects non-admin user with 403", async () => {
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ name: "User", email: "user@example.com", password: "securePassword123" })
      .expect(201);
    const res = await request(app)
      .post("/api/jobs/maintenance/stale")
      .set("Authorization", `Bearer ${reg.body.token}`);
    expect(res.status).toBe(403);
  });

  test("allows admin and soft-deactivates stale jobs, no data deleted", async () => {
    // Pin the system clock so the endpoint's real-time cutoff is deterministic.
    // Only Date is faked; timers stay real so supertest/mongoose async works.
    jest.useFakeTimers({
      doNotFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "setImmediate",
        "clearImmediate",
        "queueMicrotask",
        "nextTick",
        "performance",
      ],
    });
    const now = new Date();
    const pinned = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    jest.setSystemTime(pinned);

    try {
      // Create a regular user, then elevate to ADMIN in DB and log in for a token.
      const reg = await request(app)
        .post("/api/auth/register")
        .send({ name: "Admin", email: "admin@example.com", password: "securePassword123" })
        .expect(201);
      await User.updateOne({ email: "admin@example.com" }, { $set: { role: Role.ADMIN } });
      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: "admin@example.com", password: "securePassword123" })
        .expect(200);

      await seedJob({ lastSeenAt: new Date(pinned.getTime() - 30 * DAY_MS) });
      await seedJob({ lastSeenAt: new Date(pinned.getTime()) });

      const res = await request(app)
        .post("/api/jobs/maintenance/stale")
        .set("Authorization", `Bearer ${login.body.token}`);
      expect(res.status).toBe(200);
      expect(res.body.evaluated).toBe(1);
      expect(res.body.deactivated).toBe(1);
      expect(res.body.staleDays).toBe(JOB_STALE_DAYS_DEFAULT);

      // No Job documents/history deleted; only the stale job flipped to inactive.
      expect(await Job.countDocuments({})).toBe(2);
      expect(await Job.countDocuments({ isActive: true })).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
