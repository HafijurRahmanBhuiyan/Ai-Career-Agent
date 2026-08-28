import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import Job from "../src/models/Job";
import { Application } from "../src/models/Application";
import { ApplicationFollowUp } from "../src/models/ApplicationFollowUp";
import { InterviewPreparation } from "../src/models/InterviewPreparation";
import { Types } from "mongoose";

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
    __gmail: {},
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

const mockClaudeAnalyze = () => {
  const client = require("../src/integrations/claude/claudeClient");
  return client.__getAnalyzeProject() as jest.Mock;
};

const assistSuggestion = {
  action: "recruiter_follow_up",
  note: "Check for status update",
  dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  priority: "high",
  reason: "Application active and no recent activity.",
};

const assistJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    suggestions: [
      assistSuggestion,
      ...(Array.isArray(overrides.suggestions) ? overrides.suggestions : []),
    ],
    ...overrides,
  });

const createJob = async (overrides: Record<string, unknown> = {}) => {
  return Job.create({
    source: "mock",
    sourceJobId: `ac-${Date.now()}-${Math.random()}`,
    title: "Senior Engineer",
    companyName: "Acme",
    description: "A senior engineering role.",
    ...overrides,
  });
};

const createApp = async (token: string, status = "applied") => {
  const job = await createJob();
  const res = await request(app)
    .post("/api/applications")
    .set("Authorization", `Bearer ${token}`)
    .send({ jobId: String(job._id), status });
  return { id: res.body.application._id as string, jobId: String(job._id) };
};

const addFollowUp = async (
  token: string,
  appId: string,
  overrides: Record<string, unknown> = {}
) => {
  const res = await request(app)
    .post(`/api/applications/${appId}/follow-ups`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      action: "recruiter_follow_up",
      dueAt: "2026-09-01T00:00:00Z",
      ...overrides,
    });
  return res;
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
  jest.restoreAllMocks();
  mockClaudeAnalyze().mockReset();
  mockClaudeAnalyze().mockResolvedValue("{}");
});

describe("Follow-up priority - model and validation", () => {
  test("defaults priority to medium on create", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await addFollowUp(token, id);
    expect(res.status).toBe(201);
    expect(res.body.followUp.priority).toBe("medium");
  });

  test("accepts explicit priority on create", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await addFollowUp(token, id, { priority: "high" });
    expect(res.status).toBe(201);
    expect(res.body.followUp.priority).toBe("high");
  });

  test("updates priority", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);
    const created = await addFollowUp(token, id);
    const followUpId = created.body.followUp.id;

    const res = await request(app)
      .patch(`/api/applications/${id}/follow-ups/${followUpId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ priority: "low" });
    expect(res.status).toBe(200);
    expect(res.body.followUp.priority).toBe("low");
  });

  test("rejects an invalid priority", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await addFollowUp(token, id, { priority: "urgent" });
    expect(res.status).toBe(422);
  });

  test("rejects client-controlled completedAt on create", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await addFollowUp(token, id, {
      completedAt: "2026-09-01T00:00:00Z",
    });
    expect(res.status).toBe(422);
  });

  test("rejects client-controlled application on create", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await addFollowUp(token, id, {
      application: "507f1f77bcf86cd799439011",
    });
    expect(res.status).toBe(422);
  });
});

describe("Follow-up priority - list filter", () => {
  test("filters by priority on the application list", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    await addFollowUp(token, id, { priority: "high" });
    await addFollowUp(token, id, {
      action: "custom",
      priority: "low",
      dueAt: "2026-09-02T00:00:00Z",
    });

    const res = await request(app)
      .get(`/api/applications/${id}/follow-ups?priority=high`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.followUps[0].priority).toBe("high");
  });

  test("rejects an invalid priority filter", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .get(`/api/applications/${id}/follow-ups?priority=urgent`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  test("rejects unknown query fields", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .get(`/api/applications/${id}/follow-ups?foo=bar`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
  });
});

describe("Action and preparation summary in application detail", () => {
  test("actionSummary is computed from persisted follow-ups", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    await addFollowUp(token, id, {
      action: "recruiter_follow_up",
      priority: "high",
      dueAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await addFollowUp(token, id, {
      action: "custom",
      priority: "low",
      dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const completed = await addFollowUp(token, id, {
      action: "thank_you_note",
      dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await request(app)
      .patch(`/api/applications/${id}/follow-ups/${completed.body.followUp.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ completed: true });

    const res = await request(app)
      .get(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const s = res.body.actionSummary;
    expect(s.total).toBe(3);
    expect(s.open).toBe(2);
    expect(s.overdue).toBe(1);
    expect(s.completed).toBe(1);
    expect(s.upcoming).toBe(1);
    expect(s.dueToday).toBe(0);
    expect(s.highPriorityOpen).toBe(1);
  });

  test("actionSummary is all zeros when there are no follow-ups", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .get(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.actionSummary).toEqual({
      total: 0,
      open: 0,
      overdue: 0,
      dueToday: 0,
      upcoming: 0,
      completed: 0,
      highPriorityOpen: 0,
    });
  });

  test("preparationSummary reflects checklist completion", async () => {
    const { token, user } = await registerUser();
    const { id } = await createApp(token);

    await InterviewPreparation.create({
      user: user.id,
      application: id,
      checklist: [
        { key: "resume_reviewed", label: "Resume reviewed", completed: true },
        { key: "company_researched", label: "Company researched", completed: false },
        { key: "star_stories_prepared", label: "STAR stories", completed: true },
        { key: "technical_topics_prepared", label: "Technical topics", completed: false },
      ],
    });

    const res = await request(app)
      .get(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.preparationSummary).toEqual({
      totalChecklistItems: 4,
      completedChecklistItems: 2,
      completionPercent: 50,
    });
  });

  test("preparationSummary is empty-safe without preparation", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .get(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.preparationSummary).toEqual({
      totalChecklistItems: 0,
      completedChecklistItems: 0,
      completionPercent: 0,
    });
  });
});

describe("Global follow-ups endpoint", () => {
  test("requires auth", async () => {
    const res = await request(app).get("/api/applications/follow-ups");
    expect(res.status).toBe(401);
  });

  test("lists the user's follow-ups across applications", async () => {
    const { token } = await registerUser();
    const { id: a1 } = await createApp(token);
    const { id: a2 } = await createApp(token);

    await addFollowUp(token, a1, { priority: "high" });
    await addFollowUp(token, a2, { action: "custom", dueAt: "2026-09-05T00:00:00Z" });

    const res = await request(app)
      .get("/api/applications/follow-ups")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.followUps).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
    // does not leak the user owner id
    expect(JSON.stringify(res.body)).not.toContain('"user":');
  });

  test("does not expose another user's follow-ups", async () => {
    const first = await registerUser();
    const second = await registerSecondUser();
    const { id } = await createApp(first.token);
    await addFollowUp(first.token, id, { note: "SECRET-followup" });

    const res = await request(app)
      .get("/api/applications/follow-ups")
      .set("Authorization", `Bearer ${second.token}`);
    expect(res.status).toBe(200);
    expect(res.body.followUps).toHaveLength(0);
    expect(JSON.stringify(res.body)).not.toContain("SECRET-followup");
  });

  test("supports priority and completed filters", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const fu = await addFollowUp(token, id, { priority: "high" });
    await addFollowUp(token, id, {
      action: "custom",
      priority: "low",
      dueAt: "2026-09-02T00:00:00Z",
    });
    await request(app)
      .patch(`/api/applications/${id}/follow-ups/${fu.body.followUp.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ completed: true });

    const high = await request(app)
      .get("/api/applications/follow-ups?priority=high")
      .set("Authorization", `Bearer ${token}`);
    expect(high.body.pagination.total).toBe(1);
    expect(high.body.followUps[0].priority).toBe("high");

    const completed = await request(app)
      .get("/api/applications/follow-ups?completed=true")
      .set("Authorization", `Bearer ${token}`);
    expect(completed.body.pagination.total).toBe(1);
    expect(completed.body.followUps[0].completed).toBe(true);
  });

  test("supports due bucket filtering", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    await addFollowUp(token, id, {
      note: "overdue-item",
      dueAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await addFollowUp(token, id, {
      note: "upcoming-item",
      dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const overdue = await request(app)
      .get("/api/applications/follow-ups?due=overdue")
      .set("Authorization", `Bearer ${token}`);
    expect(overdue.body.pagination.total).toBe(1);
    expect(overdue.body.followUps[0].note).toBe("overdue-item");

    const upcoming = await request(app)
      .get("/api/applications/follow-ups?due=upcoming")
      .set("Authorization", `Bearer ${token}`);
    expect(upcoming.body.pagination.total).toBe(1);
    expect(upcoming.body.followUps[0].note).toBe("upcoming-item");
  });

  test("marks follow-ups for rejected/withdrawn applications as inactive via due filter", async () => {
    const first = await registerUser();
    const { id } = await createApp(first.token, "rejected");
    await addFollowUp(first.token, id, { note: "rejected-app-followup" });

    const res = await request(app)
      .get("/api/applications/follow-ups?due=inactive")
      .set("Authorization", `Bearer ${first.token}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.followUps[0].note).toBe("rejected-app-followup");
  });

  test("paginates the global list", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    for (let i = 0; i < 5; i++) {
      await addFollowUp(token, id, {
        note: `fu-${i}`,
        dueAt: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    const page1 = await request(app)
      .get("/api/applications/follow-ups?limit=2&page=1")
      .set("Authorization", `Bearer ${token}`);
    expect(page1.body.followUps).toHaveLength(2);
    expect(page1.body.pagination.total).toBe(5);
    expect(page1.body.pagination.totalPages).toBe(3);

    const page3 = await request(app)
      .get("/api/applications/follow-ups?limit=2&page=3")
      .set("Authorization", `Bearer ${token}`);
    expect(page3.body.followUps).toHaveLength(1);
  });

  test("rejects an unbounded limit on the global list", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);
    await addFollowUp(token, id);

    const res = await request(app)
      .get("/api/applications/follow-ups?limit=10000")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
  });
});

describe("Follow-up AI assist", () => {
  test("requires auth", async () => {
    const res = await request(app).post(
      "/api/applications/507f1f77bcf86cd799439011/follow-ups/assist"
    );
    expect(res.status).toBe(401);
  });

  test("returns suggestions for review without persisting anything", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    mockClaudeAnalyze().mockResolvedValue(assistJson());

    const res = await request(app)
      .post(`/api/applications/${id}/follow-ups/assist`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0].action).toBe("recruiter_follow_up");
    expect(res.body.suggestions[0].priority).toBe("high");

    const count = await ApplicationFollowUp.countDocuments({ application: id });
    expect(count).toBe(0);
  });

  test("returns 404 for another user's application", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .post(`/api/applications/${id}/follow-ups/assist`)
      .set("Authorization", `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });

  test("returns 404 for a non-existent application", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/applications/507f1f77bcf86cd799439011/follow-ups/assist")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test("rejects invalid Claude output with 422 and persists nothing", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    mockClaudeAnalyze().mockResolvedValue(
      JSON.stringify({ suggestions: [{ action: "bogus", priority: "urgent" }] })
    );

    const res = await request(app)
      .post(`/api/applications/${id}/follow-ups/assist`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);

    const count = await ApplicationFollowUp.countDocuments({ application: id });
    expect(count).toBe(0);
  });
});
