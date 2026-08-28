import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import Job from "../src/models/Job";
import { ApplicationFollowUp } from "../src/models/ApplicationFollowUp";
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

const createJob = async (overrides: Record<string, unknown> = {}) => {
  return Job.create({
    source: "mock",
    sourceJobId: `fu-${Date.now()}-${Math.random()}`,
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
});

describe("Application follow-ups - authentication", () => {
  test("GET requires auth", async () => {
    const res = await request(app).get("/api/applications/507f1f77bcf86cd799439011/follow-ups");
    expect(res.status).toBe(401);
  });

  test("POST requires auth", async () => {
    const res = await request(app)
      .post("/api/applications/507f1f77bcf86cd799439011/follow-ups")
      .send({ action: "recruiter_follow_up", dueAt: "2026-09-01T00:00:00Z" });
    expect(res.status).toBe(401);
  });

  test("PATCH requires auth", async () => {
    const res = await request(app)
      .patch("/api/applications/507f1f77bcf86cd799439011/follow-ups/507f1f77bcf86cd799439011")
      .send({ completed: true });
    expect(res.status).toBe(401);
  });

  test("DELETE requires auth", async () => {
    const res = await request(app).delete("/api/applications/507f1f77bcf86cd799439011/follow-ups/507f1f77bcf86cd799439011");
    expect(res.status).toBe(401);
  });
});

describe("Application follow-ups - CRUD", () => {
  test("creates a follow-up with default completed false", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .post(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "recruiter_follow_up", note: "Ping recruiter", dueAt: "2026-09-01T00:00:00Z" });

    expect(res.status).toBe(201);
    expect(res.body.followUp.action).toBe("recruiter_follow_up");
    expect(res.body.followUp.note).toBe("Ping recruiter");
    expect(res.body.followUp.completed).toBe(false);
    expect(res.body.followUp.completedAt).toBeNull();
    expect(res.body.followUp).not.toHaveProperty("user");
    expect(res.body.followUp.id).toBeTruthy();
  });

  test("lists follow-ups sorted by due date ascending", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    await request(app)
      .post(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "custom", note: "Later", dueAt: "2026-09-10T00:00:00Z" });
    await request(app)
      .post(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "custom", dueAt: "2026-09-01T00:00:00Z" });

    const res = await request(app)
      .get(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.followUps).toHaveLength(2);
    expect(res.body.followUps[0].note).toBeNull();
    expect(res.body.followUps[1].note).toBe("Later");
    expect(res.body.pagination.total).toBe(2);
  });

  test("marks a follow-up complete and sets completedAt server-side", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const created = await request(app)
      .post(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "thank_you_note", dueAt: "2026-09-01T00:00:00Z" });
    const followUpId = created.body.followUp.id;

    const res = await request(app)
      .patch(`/api/applications/${id}/follow-ups/${followUpId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ completed: true });

    expect(res.status).toBe(200);
    expect(res.body.followUp.completed).toBe(true);
    expect(res.body.followUp.completedAt).toBeTruthy();

    const reopened = await request(app)
      .patch(`/api/applications/${id}/follow-ups/${followUpId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ completed: false });
    expect(reopened.body.followUp.completed).toBe(false);
    expect(reopened.body.followUp.completedAt).toBeNull();
  });

  test("filters by completed status", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const created = await request(app)
      .post(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "custom", dueAt: "2026-09-01T00:00:00Z" });
    await request(app)
      .patch(`/api/applications/${id}/follow-ups/${created.body.followUp.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ completed: true });

    const incomplete = await request(app)
      .get(`/api/applications/${id}/follow-ups?completed=false`)
      .set("Authorization", `Bearer ${token}`);
    expect(incomplete.body.pagination.total).toBe(0);

    const complete = await request(app)
      .get(`/api/applications/${id}/follow-ups?completed=true`)
      .set("Authorization", `Bearer ${token}`);
    expect(complete.body.pagination.total).toBe(1);
  });

  test("deletes a follow-up", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const created = await request(app)
      .post(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "custom", dueAt: "2026-09-01T00:00:00Z" });

    const res = await request(app)
      .delete(`/api/applications/${id}/follow-ups/${created.body.followUp.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Follow-up deleted");

    const count = await ApplicationFollowUp.countDocuments({ application: id });
    expect(count).toBe(0);
  });
});

describe("Application follow-ups - ownership", () => {
  test("another user cannot list another's follow-ups (404)", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .get(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });

  test("another user cannot create a follow-up (404)", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .post(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ action: "recruiter_follow_up", dueAt: "2026-09-01T00:00:00Z" });
    expect(res.status).toBe(404);
  });

  test("another user cannot update or delete another's follow-up (404)", async () => {
    const { token, user } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const { id } = await createApp(token);

    const followUp = await ApplicationFollowUp.create({
      user: user.id,
      application: id,
      action: "custom",
      dueAt: new Date("2026-09-01T00:00:00Z"),
    });
    const followUpId = String(followUp._id);

    const patch = await request(app)
      .patch(`/api/applications/${id}/follow-ups/${followUpId}`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ completed: true });
    expect(patch.status).toBe(404);

    const del = await request(app)
      .delete(`/api/applications/${id}/follow-ups/${followUpId}`)
      .set("Authorization", `Bearer ${token2}`);
    expect(del.status).toBe(404);
  });

  test("returns 404 for an invalid follow-up id", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .patch(`/api/applications/${id}/follow-ups/not-an-id`)
      .set("Authorization", `Bearer ${token}`)
      .send({ completed: true });
    expect(res.status).toBe(404);
  });

  test("returns 404 for a valid but non-existent follow-up id", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .patch(`/api/applications/${id}/follow-ups/507f1f77bcf86cd799439011`)
      .set("Authorization", `Bearer ${token}`)
      .send({ completed: true });
    expect(res.status).toBe(404);
  });
});

describe("Application follow-ups - validation", () => {
  test("rejects a missing action", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .post(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dueAt: "2026-09-01T00:00:00Z" });
    expect(res.status).toBe(422);
  });

  test("rejects an invalid action enum value", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .post(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "banana", dueAt: "2026-09-01T00:00:00Z" });
    expect(res.status).toBe(422);
  });

  test("rejects a missing or invalid due date", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const missing = await request(app)
      .post(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "custom" });
    expect(missing.status).toBe(422);

    const invalid = await request(app)
      .post(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "custom", dueAt: "not-a-date" });
    expect(invalid.status).toBe(422);
  });

  test("rejects unknown fields on create", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .post(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "custom", dueAt: "2026-09-01T00:00:00Z", extra: 1 });
    expect(res.status).toBe(422);
  });

  test("rejects an empty update body", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const created = await request(app)
      .post(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "custom", dueAt: "2026-09-01T00:00:00Z" });

    const res = await request(app)
      .patch(`/api/applications/${id}/follow-ups/${created.body.followUp.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(422);
  });

  test("rejects a limit above the maximum on list", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .get(`/api/applications/${id}/follow-ups?limit=500`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
  });
});

describe("Application follow-ups - detail API integration", () => {
  test("follow-ups are included in the application detail response", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    await request(app)
      .post(`/api/applications/${id}/follow-ups`)
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "application_follow_up", dueAt: "2026-09-01T00:00:00Z" });

    const res = await request(app)
      .get(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.followUps).toHaveLength(1);
    expect(res.body.followUps[0].action).toBe("application_follow_up");
    expect(res.body.followUps[0]).not.toHaveProperty("user");
    expect(res.body.followUps[0].application).toBe(id);
  });
});
