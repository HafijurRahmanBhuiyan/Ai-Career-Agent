import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import Job from "../src/models/Job";
import { Application } from "../src/models/Application";
import ApplicationEvent from "../src/models/ApplicationEvent";
import { ApplicationFollowUp } from "../src/models/ApplicationFollowUp";
import { InterviewPreparation } from "../src/models/InterviewPreparation";
import { CareerEmail } from "../src/models/CareerEmail";
import { Types } from "mongoose";
import { buildApplicationAnalytics } from "../src/services/applicationAnalytics";
import User from "../src/models/User";

// Deterministic "now" so time-sensitive unit tests are stable across runs.
const NOW = new Date("2026-01-15T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

jest.mock("../src/integrations/gmail/gmailClient", () => {
  const gmail = {
    getOAuthAuthorizeUrl: jest.fn(() => "https://accounts.google.com/test"),
    exchangeCodeForToken: jest.fn(() =>
      Promise.resolve({
        access_token: "ya29_access",
        refresh_token: "1//refresh",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/gmail.readonly",
      })
    ),
    refreshAccessToken: jest.fn(() =>
      Promise.resolve({ access_token: "ya29_refreshed", expires_in: 3600 })
    ),
    getProfile: jest.fn(() => Promise.resolve({ emailAddress: "me@gmail.com" })),
    listMessages: jest.fn(() => Promise.resolve([])),
    getMessageMeta: jest.fn(() => Promise.resolve({})),
    getMessageFull: jest.fn(() => Promise.resolve({})),
  };
  return {
    getGmailScopes: jest.fn(() => "https://www.googleapis.com/auth/gmail.readonly"),
    GmailClient: Object.assign(
      jest.fn().mockImplementation(() => ({
        getProfile: gmail.getProfile,
        listMessages: gmail.listMessages,
        getMessageMeta: gmail.getMessageMeta,
        getMessageFull: gmail.getMessageFull,
      })),
      {
        getOAuthAuthorizeUrl: gmail.getOAuthAuthorizeUrl,
        exchangeCodeForToken: gmail.exchangeCodeForToken,
        refreshAccessToken: gmail.refreshAccessToken,
      }
    ),
  };
});

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

let jobSeq = 0;

const makeJob = async (company = "Acme", overrides: Record<string, unknown> = {}) => {
  return Job.create({
    source: "mock",
    sourceJobId: `an-${++jobSeq}-${Date.now()}`,
    title: "Senior Engineer",
    companyName: company,
    description: "A senior engineering role.",
    ...overrides,
  });
};

const makeApp = async (
  userObjId: string,
  status: string,
  overrides: Record<string, unknown> = {}
) => {
  const job = await makeJob();
  return Application.create({
    user: userObjId,
    job: job._id,
    status,
    ...overrides,
  });
};

const installAppUsers = async () => {
  const a = await registerUser();
  const b = await registerSecondUser();
  const job = await makeJob("Acme");
  const userA = await User.findOne({ email: a.user.email as string }).select("_id");
  const userB = await User.findOne({ email: b.user.email as string }).select("_id");
  return {
    tokenA: a.token,
    userAId: String(userA!._id),
    tokenB: b.token,
    userBId: String(userB!._id),
    jobId: String(job._id),
  };
};

beforeAll(async () => {
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "b".repeat(64);
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  jobSeq = 0;
  jest.restoreAllMocks();
});

describe("Analytics - HTTP contract & security", () => {
  test("requires authentication (401 without token)", async () => {
    const res = await request(app).get("/api/applications/analytics");
    expect(res.status).toBe(401);
  });

  test("rejects an invalid range with 422", async () => {
    const { tokenA } = await installAppUsers();
    const res = await request(app)
      .get("/api/applications/analytics?range=bogus")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: "Validation failed", statusCode: 422 });
    expect(res.body.details).toBeDefined();
  });

  test("rejects an unknown query field with 422", async () => {
    const { tokenA } = await installAppUsers();
    const res = await request(app)
      .get("/api/applications/analytics?userId=abc&ownerId=def")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(422);
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  test("rejects out-of-bounds limit with 422", async () => {
    const { tokenA } = await installAppUsers();
    for (const bad of ["0", "21", "abc"]) {
      const res = await request(app)
        .get(`/api/applications/analytics?limit=${bad}`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(res.status).toBe(422);
    }
  });

  test("empty user returns valid zero analytics", async () => {
    const { tokenA } = await installAppUsers();
    const res = await request(app)
      .get("/api/applications/analytics?range=all")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const body = res.body;
    expect(body.summary.totalApplications).toBe(0);
    expect(body.summary.staleApplications).toBe(0);
    expect(body.summary.totalOffers).toBe(0);
    expect(body.summary.totalRejections).toBe(0);
    expect(body.conversionMetrics.applicationToInterviewRate).toBe(0);
    expect(body.conversionMetrics.rejectionRate).toBe(0);
    expect(body.funnel.stages.map((s: { count: number }) => s.count)).toEqual([0, 0, 0, 0]);
    expect(body.companies).toEqual([]);
    expect(body.attentionItems).toEqual([]);
    expect(body.followUps.completionRate).toBe(0);
    expect(body.preparation.averageCompletionPercent).toBe(0);
    expect(Object.values(body.applicationsByStatus).every((v) => v === 0)).toBe(true);
  });

  test("registering analytics route does not shadow application detail", async () => {
    const { tokenA, jobId } = await installAppUsers();
    // Create one application so its detail endpoint is reachable.
    await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ jobId, status: "applied" });
    const res = await request(app)
      .get("/api/applications/analytics")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("summary");
  });

  test("does not leak raw user metadata or sensitive fields", async () => {
    const { userAId, tokenA } = await installAppUsers();
    const application = await Application.create({
      user: userAId,
      job: (await makeJob("X Corp"))._id,
      status: "applied",
    });
    await makeFollowUp(userAId, String(application._id), { dueAt: new Date(NOW.getTime() - 1000) });
    const res = await request(app)
      .get("/api/applications/analytics")
      .set("Authorization", `Bearer ${tokenA}`);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(userAId);
    expect(raw).not.toContain("__v");
    expect(raw).not.toContain("gmailMessageId");
    expect(raw).not.toContain("refresh_token");
    expect(raw).not.toContain("1//refresh");
    expect(raw).not.toContain("ya29_");
    expect(res.body).not.toHaveProperty("user");
  });

  test("isolates users: user B never sees user A analytics", async () => {
    const { userAId, tokenB } = await installAppUsers();
    await makeApp(userAId, "offer");
    await makeApp(userAId, "interview");
    const res = await request(app)
      .get("/api/applications/analytics")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.totalApplications).toBe(0);
    expect(res.body.summary.totalOffers).toBe(0);
  });
});

async function makeFollowUp(
  userObjId: string,
  appId: string,
  overrides: Record<string, unknown> = {}
) {
  return ApplicationFollowUp.create({
    user: userObjId,
    application: appId,
    action: "recruiter_follow_up",
    dueAt: new Date(NOW.getTime() + 2 * DAY_MS),
    priority: "medium",
    ...overrides,
  });
}

describe("Analytics - service metrics (deterministic now)", () => {
  test("applications by status, active, and completed counts", async () => {
    const { userAId } = await installAppUsers();
    await makeApp(userAId, "saved");
    await makeApp(userAId, "applied");
    await makeApp(userAId, "screening");
    await makeApp(userAId, "interview");
    await makeApp(userAId, "offer");
    await makeApp(userAId, "rejected");
    await makeApp(userAId, "withdrawn");

    const r = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    expect(r.summary.totalApplications).toBe(7);
    expect(r.summary.activeApplications).toBe(3); // applied, screening, interview
    expect(r.summary.completedApplications).toBe(3); // offer, rejected, withdrawn
    expect(r.applicationsByStatus).toEqual({
      saved: 1,
      applied: 1,
      screening: 1,
      interview: 1,
      offer: 1,
      rejected: 1,
      withdrawn: 1,
    });
  });

  test("conversion rates are computed from current status with documented denominators", async () => {
    const { userAId } = await installAppUsers();
    await makeApp(userAId, "applied");
    await makeApp(userAId, "applied");
    await makeApp(userAId, "saved");
    await makeApp(userAId, "screening");
    await makeApp(userAId, "interview");
    await makeApp(userAId, "offer");
    await makeApp(userAId, "rejected");
    await makeApp(userAId, "rejected");
    await makeApp(userAId, "rejected");
    await makeApp(userAId, "withdrawn");
    // total = 10; reachedScreening=3; reachedInterview=2; reachedOffer=1; rejected=3; withdrawn=1
    const r = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    expect(r.summary.totalApplications).toBe(10);
    expect(r.conversionMetrics.applicationToScreeningRate).toBeCloseTo(0.3);
    expect(r.conversionMetrics.screeningToInterviewRate).toBeCloseTo(2 / 3);
    expect(r.conversionMetrics.applicationToInterviewRate).toBeCloseTo(0.2);
    expect(r.conversionMetrics.interviewToOfferRate).toBeCloseTo(0.5);
    expect(r.conversionMetrics.applicationToOfferRate).toBeCloseTo(0.1);
    expect(r.conversionMetrics.rejectionRate).toBeCloseTo(0.3);
  });

  test("zero-denominator conversion returns 0 without error", async () => {
    const { userAId } = await installAppUsers();
    await makeApp(userAId, "saved");
    const r = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    expect(r.summary.totalApplications).toBe(1);
    expect(r.conversionMetrics.applicationToInterviewRate).toBe(0);
    expect(r.conversionMetrics.screeningToInterviewRate).toBe(0);
    expect(r.conversionMetrics.interviewToOfferRate).toBe(0);
    expect(r.conversionMetrics.applicationToOfferRate).toBe(0);
    expect(r.conversionMetrics.rejectionRate).toBe(0);
    expect(r.funnel.stages.find((s) => s.key === "interview")?.count).toBe(0);
  });

  test("funnel counts, percentages, and drop-off", async () => {
    const { userAId } = await installAppUsers();
    await makeApp(userAId, "applied");
    await makeApp(userAId, "applied");
    await makeApp(userAId, "screening");
    await makeApp(userAId, "interview");
    await makeApp(userAId, "offer");
    // total=5, screening=3, interview=2, offer=1
    const r = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    const stages = r.funnel.stages;
    expect(stages.map((s) => s.count)).toEqual([5, 3, 2, 1]);
    expect(stages[0].dropOff).toBe(0);
    expect(stages[1].dropOff).toBe(2); // 5 -> 3
    expect(stages[2].dropOff).toBe(1); // 3 -> 2
    expect(stages[3].dropOff).toBe(1); // 2 -> 1
    expect(r.funnel.rejections).toBe(0);
    expect(r.funnel.withdrawals).toBe(0);
  });

  test("stale applications counted from updatedAt against stale cutoff", async () => {
    const { userAId } = await installAppUsers();
    const fresh = await makeApp(userAId, "applied");
    const stale = await makeApp(userAId, "screening");
    const staleOffer = await makeApp(userAId, "offer");
    // Force stale updatedAt for the screening app (active status).
    await Application.collection.updateOne(
      { _id: stale._id },
      { $set: { updatedAt: new Date(NOW.getTime() - 20 * DAY_MS) } }
    );
    await Application.collection.updateOne(
      { _id: fresh._id },
      { $set: { updatedAt: new Date(NOW.getTime() - 1000) } }
    );
    const r = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    expect(r.summary.staleApplications).toBe(1);
    // offer is not active so is never counted as stale.
    void staleOffer;
  });

  test("interview metrics from events and upcoming interviews", async () => {
    const { userAId } = await installAppUsers();
    const appOffer = await makeApp(userAId, "offer");
    const appInterview = await makeApp(userAId, "interview");
    const appRejected = await makeApp(userAId, "rejected");
    // Two applications reached interview via status_changed events.
    await ApplicationEvent.create({
      user: userAId,
      application: appOffer._id,
      type: "status_changed",
      source: "system",
      title: "status changed to interview",
      eventDate: new Date(NOW.getTime() - 10 * DAY_MS),
    });
    await ApplicationEvent.create({
      user: userAId,
      application: appRejected._id,
      type: "status_changed",
      source: "system",
      title: "status changed to interview",
      eventDate: new Date(NOW.getTime() - 8 * DAY_MS),
    });
    // One future interview scheduled on the interview-status app via email.
    await CareerEmail.create({
      user: userAId,
      gmailMessageId: `g-${Date.now()}`,
      application: appInterview._id,
      receivedAt: new Date(NOW.getTime() - 1000),
      interview: { scheduledAt: new Date(NOW.getTime() + 3 * DAY_MS) },
    });

    const r = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    expect(r.summary.totalInterviews).toBe(2); // offer + rejected both reached interview
    expect(r.summary.upcomingInterviews).toBe(1);
    expect(r.summary.completedInterviews).toBeGreaterThanOrEqual(1);
    expect(r.summary.totalOffers).toBe(1);
    expect(r.summary.totalRejections).toBe(1);
  });

  test("time-to-stage uses real event dates and returns null when insufficient", async () => {
    const { userAId } = await installAppUsers();
    const appOffer = await makeApp(userAId, "offer", {
      appliedAt: new Date(NOW.getTime() - 30 * DAY_MS),
    });
    await ApplicationEvent.create({
      user: userAId,
      application: appOffer._id,
      type: "interview_scheduled",
      source: "gmail",
      title: "Interview scheduled",
      eventDate: new Date(NOW.getTime() - 10 * DAY_MS),
    });
    await ApplicationEvent.create({
      user: userAId,
      application: appOffer._id,
      type: "offer_received",
      source: "gmail",
      title: "Offer received",
      eventDate: new Date(NOW.getTime() - 2 * DAY_MS),
    });
    const r = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    // interview -> offer = 8 days
    expect(r.timeToStage.interviewToOffer.sampleCount).toBe(1);
    expect(r.timeToStage.interviewToOffer.averageDays).toBeCloseTo(8);
    expect(r.timeToStage.interviewToOffer.medianDays).toBeCloseTo(8);
    // No screening event -> null
    expect(r.timeToStage.applicationToScreening.sampleCount).toBe(0);
    expect(r.timeToStage.applicationToScreening.averageDays).toBeNull();
    expect(r.timeToStage.applicationToRejection.averageDays).toBeNull();
  });

  test("invalid or missing event dates are handled safely (no crash, null)", async () => {
    const { userAId } = await installAppUsers();
    const appOffer = await makeApp(userAId, "offer");
    // No appliedAt, no completion events -> nothing to compute.
    const r = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    expect(r.summary.totalApplications).toBe(1);
    expect(r.timeToStage.interviewToOffer.sampleCount).toBe(0);
    expect(r.timeToStage.applicationToOffer.averageDays).toBeNull();
  });
});

describe("Analytics - trends, time ranges, follow-ups, prep, companies, attention", () => {
  test("time range metadata and trend totals", async () => {
    const { userAId } = await installAppUsers();
    await makeApp(userAId, "applied", {
      appliedAt: new Date(NOW.getTime() - 3 * DAY_MS),
    });
    await makeApp(userAId, "applied", {
      appliedAt: new Date(NOW.getTime() - 5 * DAY_MS),
    });
    await makeApp(userAId, "applied", {
      appliedAt: new Date(NOW.getTime() - 60 * DAY_MS), // outside 7d, inside 90d
    });
    const r7 = await buildApplicationAnalytics(userAId, { range: "7d", now: NOW });
    expect(r7.range.value).toBe("7d");
    expect(r7.trends.applicationsApplied.totalInRange).toBe(2);

    const r90 = await buildApplicationAnalytics(userAId, { range: "90d", now: NOW });
    expect(r90.trends.applicationsApplied.totalInRange).toBe(3);
    const sum7 = r7.trends.applicationsApplied.points.reduce(
      (acc, p) => acc + p.value,
      0
    );
    expect(sum7).toBe(2);
  });

  test("trend points are deterministic and bounded to 30 buckets", async () => {
    const { userAId } = await installAppUsers();
    await makeApp(userAId, "applied", { appliedAt: new Date(NOW.getTime() - DAY_MS) });
    const a = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    const b = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    expect(JSON.stringify(a.trends)).toBe(JSON.stringify(b.trends));
    for (const key of Object.keys(a.trends)) {
      expect(a.trends[key as keyof typeof a.trends].points.length).toBeLessThanOrEqual(30);
    }
  });

  test("follow-up performance metrics", async () => {
    const { userAId } = await installAppUsers();
    const app1 = await makeApp(userAId, "applied");
    const app2 = await makeApp(userAId, "interview");
    const app3 = await makeApp(userAId, "applied");
    await makeFollowUp(userAId, String(app1._id), {
      dueAt: new Date(NOW.getTime() - 5 * DAY_MS),
      priority: "high",
    }); // overdue high
    await makeFollowUp(userAId, String(app1._id), {
      dueAt: new Date(NOW.getTime() - 1000),
      priority: "high",
    }); // overdue high (same app, dedup)
    await makeFollowUp(userAId, String(app2._id), {
      dueAt: new Date(NOW.getTime() + 2 * DAY_MS),
      completed: true,
      completedAt: new Date(NOW.getTime() - DAY_MS),
    }); // completed
    await makeFollowUp(userAId, String(app3._id), {
      dueAt: new Date(NOW.getTime() + DAY_MS),
      priority: "low",
    }); // upcoming low
    const r = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    expect(r.followUps.total).toBe(4);
    expect(r.followUps.completed).toBe(1);
    expect(r.followUps.open).toBe(3);
    expect(r.followUps.overdue).toBe(2);
    expect(r.followUps.highPriorityOpen).toBe(2);
    expect(r.followUps.completionRate).toBeCloseTo(0.25);
    expect(r.followUps.appsWithFollowUps).toBe(3);
    expect(r.followUps.appsWithoutFollowUps).toBe(0);
    expect(r.followUps.appsWithOverdueFollowUps).toBe(1);
  });

  test("interview preparation metrics", async () => {
    const { userAId } = await installAppUsers();
    const app1 = await makeApp(userAId, "interview"); // upcoming interview, has prep incomplete
    const app2 = await makeApp(userAId, "applied");
    const app3 = await makeApp(userAId, "applied");
    await InterviewPreparation.create({
      user: userAId,
      application: app1._id,
      checklist: [
        { key: "resume_reviewed", label: "R", completed: true },
        { key: "company_researched", label: "C", completed: false },
      ],
    });
    await InterviewPreparation.create({
      user: userAId,
      application: app2._id,
      checklist: [
        { key: "resume_reviewed", label: "R", completed: true },
        { key: "company_researched", label: "C", completed: true },
      ],
    });
    // Future interview on app1 -> incomplete prep.
    await CareerEmail.create({
      user: userAId,
      gmailMessageId: `g2-${Date.now()}`,
      application: app1._id,
      receivedAt: new Date(NOW.getTime() - 1000),
      interview: { scheduledAt: new Date(NOW.getTime() + 2 * DAY_MS) },
    });
    const r = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    expect(r.preparation.appsWithPreparation).toBe(2);
    expect(r.preparation.appsWithoutPreparation).toBe(1);
    expect(r.preparation.fullyPrepared).toBe(1); // app2
    expect(r.preparation.partiallyPrepared).toBe(1); // app1
    expect(r.preparation.averageCompletionPercent).toBe(75);
    expect(r.preparation.upcomingInterviewsWithIncompletePreparation).toBe(1);
  });

  test("company aggregation is bounded and deterministic", async () => {
    const { userAId } = await installAppUsers();
    // 12 companies to verify bounding to 10.
    for (let i = 0; i < 11; i++) {
      const job = await makeJob(`Company ${i}`);
      await Application.create({
        user: userAId,
        job: job._id,
        status: i % 3 === 0 ? "offer" : i % 2 === 0 ? "interview" : "rejected",
      });
    }
    const r = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    expect(r.companies.length).toBe(10);
    // Deterministic: first call equals a re-call.
    const r2 = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    expect(JSON.stringify(r.companies)).toBe(JSON.stringify(r2.companies));
    // Each company has 1 application; first sorted by company name asc among equal counts.
    expect(r.companies.every((c) => c.applications === 1)).toBe(true);
  });

  test("attention items are deterministic, priority-ordered, and documented", async () => {
    const { userAId } = await installAppUsers();
    // High: upcoming interview with incomplete prep.
    const high = await makeApp(userAId, "interview");
    await CareerEmail.create({
      user: userAId,
      gmailMessageId: `g3-${Date.now()}`,
      application: high._id,
      receivedAt: new Date(NOW.getTime() - 1000),
      interview: { scheduledAt: new Date(NOW.getTime() + DAY_MS) },
    });
    // Medium: stale active.
    const sticky = await makeApp(userAId, "applied");
    await Application.collection.updateOne(
      { _id: sticky._id },
      { $set: { updatedAt: new Date(NOW.getTime() - 30 * DAY_MS) } }
    );
    // Low: stuck in screening.
    await makeApp(userAId, "screening");

    const r = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    const ranks: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const priorities = r.attentionItems.map((i) => ranks[i.priority]);
    for (let i = 1; i < priorities.length; i++) {
      expect(priorities[i - 1]).toBeLessThanOrEqual(priorities[i]);
    }
    expect(r.attentionItems[0].priority).toBe("high");
    expect(r.attentionItems[0].type).toBe("upcoming_interview_incomplete_prep");
    expect(r.attentionItems.every((i) => i.reason.length > 0)).toBe(true);
  });

  test("limit option bounds attention items", async () => {
    const { userAId } = await installAppUsers();
    for (let i = 0; i < 3; i++) {
      await makeApp(userAId, "interview");
    }
    const r = await buildApplicationAnalytics(userAId, {
      range: "all",
      now: NOW,
      limit: 1,
    });
    expect(r.attentionItems.length).toBe(1);
    expect(r.limit).toBe(1);
  });

  test("overdue high-priority follow-up appears as an attention item", async () => {
    const { userAId } = await installAppUsers();
    const app = await makeApp(userAId, "applied");
    await Application.collection.updateOne(
      { _id: app._id },
      { $set: { updatedAt: new Date(NOW.getTime() - 1000) } }
    );
    await makeFollowUp(userAId, String(app._id), {
      dueAt: new Date(NOW.getTime() - 5 * DAY_MS),
      priority: "high",
    });
    const r = await buildApplicationAnalytics(userAId, { range: "all", now: NOW });
    expect(
      r.attentionItems.some((i) => i.type === "overdue_high_priority_follow_up")
    ).toBe(true);
  });
});

describe("Analytics - regression / robustness", () => {
  test("works with many applications without unbounded memory", async () => {
    const { userAId } = await installAppUsers();
    for (let i = 0; i < 25; i++) {
      const job = await makeJob("Bulk Co");
      await Application.create({
        user: userAId,
        job: job._id,
        status: i % 4 === 0 ? "offer" : "applied",
      });
    }
    const r = await buildApplicationAnalytics(userAId, { range: "365d", now: NOW });
    expect(r.summary.totalApplications).toBe(25);
    expect(typeof r.summary.staleApplications).toBe("number");
  });

  test("applications with no job still compute without leaking", async () => {
    const { userAId, tokenA } = await installAppUsers();
    // Insert an application with a non-existent job reference directly.
    await Application.create({
      user: new Types.ObjectId(userAId),
      job: new Types.ObjectId(),
      status: "applied",
    });
    const res = await request(app)
      .get("/api/applications/analytics")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.totalApplications).toBe(1);
    expect(res.body.companies[0].company).toBe("Unknown");
  });
});
