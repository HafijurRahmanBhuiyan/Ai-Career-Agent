import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import GmailConnection from "../src/models/GmailConnection";
import { CareerEmail } from "../src/models/CareerEmail";
import Job from "../src/models/Job";
import { Application } from "../src/models/Application";
import { encryptToken } from "../src/utils/encryption";

jest.mock("../src/integrations/gmail/gmailClient", () => {
  const getOAuthAuthorizeUrl = jest.fn(() =>
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=test"
  );
  const exchangeCodeForToken = jest.fn(() =>
    Promise.resolve({
      access_token: "ya29_access",
      refresh_token: "1//refresh",
      expires_in: 3600,
      scope: "https://www.googleapis.com/auth/gmail.readonly",
    })
  );
  const refreshAccessToken = jest.fn(() =>
    Promise.resolve({ access_token: "ya29_refreshed", expires_in: 3600 })
  );
  const getProfile = jest.fn(() =>
    Promise.resolve({ emailAddress: "me@gmail.com" })
  );
  const listMessages = jest.fn(() => Promise.resolve([]));
  const getMessageMeta = jest.fn(() =>
    Promise.resolve({
      id: "msg1",
      threadId: "thread1",
      subject: "Interview Invitation",
      from: "recruiter@acme.com",
      to: "me@gmail.com",
      snippet: "We would like to invite you to an interview",
      date: "2026-08-27T10:00:00Z",
    })
  );
  const getMessageFull = jest.fn(() =>
    Promise.resolve({
      id: "msg1",
      threadId: "thread1",
      snippet: "Interview",
      payload: {
        mimeType: "text/plain",
        body: { data: Buffer.from("Interview invitation body").toString("base64") },
      },
    })
  );
  return {
    getGmailScopes: jest.fn(
      () => "https://www.googleapis.com/auth/gmail.readonly"
    ),
    GmailClient: Object.assign(
      jest.fn().mockImplementation(() => ({
        getProfile,
        listMessages,
        getMessageMeta,
        getMessageFull,
      })),
      {
        getOAuthAuthorizeUrl,
        exchangeCodeForToken,
        refreshAccessToken,
      }
    ),
    __gmail: {
      getOAuthAuthorizeUrl: () => getOAuthAuthorizeUrl,
      exchangeCodeForToken: () => exchangeCodeForToken,
      refreshAccessToken: () => refreshAccessToken,
      getProfile: () => getProfile,
      listMessages: () => listMessages,
      getMessageMeta: () => getMessageMeta,
      getMessageFull: () => getMessageFull,
    },
  };
});

const gmailMocks = () => {
  const client = require("../src/integrations/gmail/gmailClient");
  return client.__gmail;
};
const mockGetOAuthAuthorizeUrl = () => gmailMocks().getOAuthAuthorizeUrl() as jest.Mock;
const mockExchangeCodeForToken = () => gmailMocks().exchangeCodeForToken() as jest.Mock;
const mockRefreshAccessToken = () => gmailMocks().refreshAccessToken() as jest.Mock;
const mockGetProfile = () => gmailMocks().getProfile() as jest.Mock;
const mockListMessages = () => gmailMocks().listMessages() as jest.Mock;
const mockGetMessageMeta = () => gmailMocks().getMessageMeta() as jest.Mock;
const mockGetMessageFull = () => gmailMocks().getMessageFull() as jest.Mock;

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

const classificationJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    category: "interview_invitation",
    confidence: 0.9,
    summary: "Acme invites you to a technical interview.",
    companyName: "Acme",
    jobTitle: "Senior Engineer",
    applicationStatus: "interview",
    interviewDate: "2026-09-01T10:00:00Z",
    interviewType: "technical",
    actionRequired: true,
    actionDeadline: "2026-08-30T00:00:00Z",
    extractedApplicationHints: { companyName: "Acme", jobTitle: "Senior Engineer" },
    ...overrides,
  });

beforeAll(async () => {
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  mockListMessages().mockReset();
  mockGetMessageMeta().mockReset();
  mockGetMessageFull().mockReset();
  mockClaudeAnalyze().mockReset();
  mockRefreshAccessToken().mockReset();
  mockGetProfile().mockResolvedValue({ emailAddress: "me@gmail.com" });
  mockListMessages().mockResolvedValue([]);
  mockGetMessageMeta().mockResolvedValue({
    id: "msg1",
    threadId: "thread1",
    subject: "Interview Invitation",
    from: "recruiter@acme.com",
    to: "me@gmail.com",
    snippet: "We would like to invite you to an interview",
    date: "2026-08-27T10:00:00Z",
  });
  mockGetMessageFull().mockResolvedValue({
    id: "msg1",
    threadId: "thread1",
    snippet: "Interview",
    payload: {
      mimeType: "text/plain",
      body: { data: Buffer.from("Interview invitation body").toString("base64") },
    },
  });
});

const createJob = async (overrides: Record<string, unknown> = {}) => {
  return Job.create({
    source: "mock",
    sourceJobId: `j${Date.now()}${Math.random()}`,
    title: "Senior Engineer",
    companyName: "Acme",
    description: "A senior engineering role.",
    ...overrides,
  });
};

const connectGmail = async (userId: string, tokenExpiry?: Date) => {
  await GmailConnection.create({
    user: userId,
    googleAccountEmail: "me@gmail.com",
    encryptedAccessToken: encryptToken("ya29_access"),
    encryptedRefreshToken: encryptToken("1//refresh"),
    tokenExpiry: tokenExpiry || new Date(Date.now() + 60 * 60 * 1000),
    scopes: "https://www.googleapis.com/auth/gmail.readonly",
    isActive: true,
  });
};

describe("Gmail OAuth", () => {
  it("rejects connect without authentication", async () => {
    const res = await request(app).get("/api/gmail/connect");
    expect(res.status).toBe(401);
  });

  it("returns an authorize URL and state for an authenticated user", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/gmail/connect")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.authorizeUrl).toContain("accounts.google.com");
    expect(res.body.state).toBeDefined();
  });

  it("rejects callback with missing code or state", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/gmail/callback")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("rejects callback with invalid OAuth state", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/gmail/callback?code=abc&state=invalidstate")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("rejects callback when state belongs to a different user", async () => {
    const first = await registerUser();
    const second = await registerSecondUser();

    const connectRes = await request(app)
      .get("/api/gmail/connect")
      .set("Authorization", `Bearer ${first.token}`);
    const state = connectRes.body.state;

    const res = await request(app)
      .get(`/api/gmail/callback?code=abc&state=${state}`)
      .set("Authorization", `Bearer ${second.token}`);
    expect(res.status).toBe(400);
  });

  it("completes a successful Gmail connection", async () => {
    const { token, user } = await registerUser();

    const connectRes = await request(app)
      .get("/api/gmail/connect")
      .set("Authorization", `Bearer ${token}`);
    const state = connectRes.body.state;

    const res = await request(app)
      .get(`/api/gmail/callback?code=validcode&state=${state}`)
      .set("Authorization", `Bearer ${token}`)
      .redirects(0);

    expect(res.status).toBe(302);

    const connection = await GmailConnection.findOne({
      user: (user as { id: string }).id,
    });
    expect(connection).toBeTruthy();
    expect(connection!.googleAccountEmail).toBe("me@gmail.com");
    expect(connection!.isActive).toBe(true);
  });

  it("reports connection status and does not leak tokens", async () => {
    const { token, user } = await registerUser();
    await connectGmail((user as { id: string }).id);

    const res = await request(app)
      .get("/api/gmail/status")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.gmail.email).toBe("me@gmail.com");
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("encryptedAccessToken");
    expect(body).not.toContain("encryptedRefreshToken");
    expect(body).not.toContain("ya29_access");
    expect(body).not.toContain("1//refresh");
  });

  it("reports not connected when no connection exists", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/gmail/status")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
  });

  it("disconnects the Gmail account", async () => {
    const { token, user } = await registerUser();
    await connectGmail((user as { id: string }).id);

    const res = await request(app)
      .post("/api/gmail/disconnect")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const connection = await GmailConnection.findOne({
      user: (user as { id: string }).id,
    });
    expect(connection).toBeNull();

    const status = await request(app)
      .get("/api/gmail/status")
      .set("Authorization", `Bearer ${token}`);
    expect(status.body.connected).toBe(false);
  });

  it("disconnect returns 404 when not connected", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/gmail/disconnect")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("Gmail Sync", () => {
  it("rejects sync when not connected", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("syncs, classifies and persists a career email", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockClaudeAnalyze().mockResolvedValue(classificationJson());

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.synced).toBe(1);
    expect(res.body.careerEmails).toBe(1);
    expect(res.body.classified).toBe(1);
    expect(res.body.skipped).toBe(0);
    expect(res.body.failed).toBe(0);

    const email = await CareerEmail.findOne({
      user: userId,
      gmailMessageId: "msg1",
    });
    expect(email).toBeTruthy();
    expect(email!.category).toBe("interview_invitation");
    expect(email!.companyName).toBe("Acme");
    expect(email!.suggestedApplicationStatus).toBe("interview");
    expect(email!.classificationStatus).toBe("classified");
  });

  it("skips non-career emails without invoking Claude", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockGetMessageMeta().mockResolvedValue({
      id: "msg1",
      threadId: "thread1",
      subject: "Dinner plans for the weekend",
      from: "friend@example.com",
      to: "me@gmail.com",
      snippet: "Should we grab dinner?",
      date: "2026-08-27T09:00:00Z",
    });

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.skipped).toBe(1);
    expect(mockClaudeAnalyze()).not.toHaveBeenCalled();
    const email = await CareerEmail.findOne({ user: userId });
    expect(email).toBeNull();
  });

  it("skips duplicate messages that are already processed", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);

    await CareerEmail.create({
      user: userId,
      gmailMessageId: "msg1",
      threadId: "thread1",
      category: "interview_invitation",
      classificationStatus: "classified",
      classifiedAt: new Date(),
    });

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockClaudeAnalyze().mockResolvedValue(classificationJson());

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.skipped).toBe(1);
    expect(mockClaudeAnalyze()).not.toHaveBeenCalled();
  });

  it("classifies an unrelated email candidate as unrelated", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockClaudeAnalyze().mockResolvedValue(
      classificationJson({ category: "unrelated", applicationStatus: null })
    );

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.classified).toBe(1);
    const email = await CareerEmail.findOne({ user: userId });
    expect(email!.category).toBe("unrelated");
    expect(email!.suggestedApplicationStatus).toBeNull();
  });

  it("handles malformed AI JSON as a failed classification", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockClaudeAnalyze().mockResolvedValue("not valid json {{");

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.failed).toBe(1);
    const email = await CareerEmail.findOne({ user: userId });
    expect(email).toBeNull();
  });

  it("handles an AI failure as a failed classification", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockClaudeAnalyze().mockRejectedValue(new Error("Claude unavailable"));

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.failed).toBe(1);
    const email = await CareerEmail.findOne({ user: userId });
    expect(email).toBeNull();
  });

  it("handles a Gmail API failure during metadata fetch", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockGetMessageMeta().mockRejectedValue(new Error("Gmail API error"));

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.failed).toBe(1);
  });

  it("returns 401 when the access token cannot be refreshed", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId, new Date(Date.now() - 1000));
    mockRefreshAccessToken().mockRejectedValue(new Error("invalid_grant"));

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);

    const connection = await GmailConnection.findOne({ user: userId });
    expect(connection!.isActive).toBe(false);
  });

  it("refreshes an expired token and proceeds with sync", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId, new Date(Date.now() - 1000));
    mockRefreshAccessToken().mockResolvedValue({
      access_token: "ya29_refreshed",
      expires_in: 3600,
    });
    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockClaudeAnalyze().mockResolvedValue(classificationJson());

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mockRefreshAccessToken()).toHaveBeenCalled();
    expect(res.body.classified).toBe(1);
  });
});

describe("Gmail Email Listing", () => {
  it("lists emails with pagination and safe fields", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;

    await CareerEmail.create({
      user: userId,
      gmailMessageId: "msg1",
      threadId: "t1",
      subject: "Interview",
      category: "interview_invitation",
      confidence: 0.9,
      summary: "Invite",
      companyName: "Acme",
      jobTitle: "Engineer",
      suggestedApplicationStatus: "interview",
      classificationStatus: "classified",
      receivedAt: new Date(),
      classifiedAt: new Date(),
    });

    const res = await request(app)
      .get("/api/gmail/emails")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.emails).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.emails[0]).not.toHaveProperty("encryptedAccessToken");
  });

  it("filters by category and application status", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;

    await CareerEmail.create([
      {
        user: userId,
        gmailMessageId: "msg1",
        category: "interview_invitation",
        suggestedApplicationStatus: "interview",
        classificationStatus: "classified",
        receivedAt: new Date(),
      },
      {
        user: userId,
        gmailMessageId: "msg2",
        category: "rejection",
        suggestedApplicationStatus: "rejected",
        classificationStatus: "classified",
        receivedAt: new Date(),
      },
    ]);

    let res = await request(app)
      .get("/api/gmail/emails?category=rejection")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.emails).toHaveLength(1);
    expect(res.body.emails[0].category).toBe("rejection");

    res = await request(app)
      .get("/api/gmail/emails?applicationStatus=interview")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.emails).toHaveLength(1);
    expect(res.body.emails[0].suggestedApplicationStatus).toBe("interview");
  });

  it("rejects an invalid filter with 422", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/gmail/emails?category=not_a_category")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  it("respects pagination boundaries", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;

    for (let i = 0; i < 3; i++) {
      await CareerEmail.create({
        user: userId,
        gmailMessageId: `msg${i}`,
        category: "follow_up",
        classificationStatus: "classified",
        receivedAt: new Date(Date.now() - i * 1000),
      });
    }

    const res = await request(app)
      .get("/api/gmail/emails?page=1&limit=2")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.totalPages).toBe(2);
    expect(res.body.emails).toHaveLength(2);
  });

  it("prevents a user from reading another user's email", async () => {
    const first = await registerUser();
    const second = await registerSecondUser();
    const firstId = (first.user as { id: string }).id;

    const email = await CareerEmail.create({
      user: firstId,
      gmailMessageId: "msg1",
      category: "interview_invitation",
      classificationStatus: "classified",
      receivedAt: new Date(),
    });

    const res = await request(app)
      .get(`/api/gmail/emails/${email._id}`)
      .set("Authorization", `Bearer ${second.token}`);
    expect(res.status).toBe(404);
  });
});

describe("Application Matching", () => {
  it("links to the single matching application", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);

    const job = await createJob({ title: "Senior Engineer", companyName: "Acme" });
    const application = await Application.create({
      user: userId,
      job: job._id,
      status: "applied",
    });

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockClaudeAnalyze().mockResolvedValue(classificationJson());

    await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    const email = await CareerEmail.findOne({ user: userId });
    expect(email!.application).toBeTruthy();
    expect(String(email!.application)).toBe(String(application._id));
  });

  it("leaves application null when there is no match", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);

    await createJob({ title: "Junior Developer", companyName: "OtherCorp" });

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockClaudeAnalyze().mockResolvedValue(classificationJson());

    await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    const email = await CareerEmail.findOne({ user: userId });
    expect(email!.application).toBeNull();
  });

  it("leaves application null when the match is ambiguous", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);

    const job1 = await createJob({ title: "Engineer A", companyName: "Acme" });
    const job2 = await createJob({ title: "Engineer B", companyName: "Acme" });
    await Application.create({ user: userId, job: job1._id, status: "applied" });
    await Application.create({ user: userId, job: job2._id, status: "applied" });

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockClaudeAnalyze().mockResolvedValue(classificationJson());

    await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    const email = await CareerEmail.findOne({ user: userId });
    expect(email!.application).toBeNull();
  });

  it("never links another user's application", async () => {
    const first = await registerUser();
    const second = await registerSecondUser();
    const firstId = (first.user as { id: string }).id;
    const secondId = (second.user as { id: string }).id;

    const job = await createJob({ title: "Senior Engineer", companyName: "Acme" });
    await Application.create({
      user: firstId,
      job: job._id,
      status: "applied",
    });
    await connectGmail(secondId);

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockClaudeAnalyze().mockResolvedValue(classificationJson());

    await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${second.token}`);

    const email = await CareerEmail.findOne({ user: secondId });
    expect(email!.application).toBeNull();
  });
});

describe("Human-in-the-Loop Status Update", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/api/gmail/emails/abc/apply-status");
    expect(res.status).toBe(401);
  });

  it("rejects an invalid status with 422", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const job = await createJob();
    const application = await Application.create({
      user: userId,
      job: job._id,
      status: "applied",
    });
    const email = await CareerEmail.create({
      user: userId,
      gmailMessageId: "msg1",
      category: "interview_invitation",
      application,
      classificationStatus: "classified",
    });

    const res = await request(app)
      .post(`/api/gmail/emails/${email._id}/apply-status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "not_a_status" });

    expect(res.status).toBe(422);
  });

  it("rejects when the email is not linked to an application", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const email = await CareerEmail.create({
      user: userId,
      gmailMessageId: "msg1",
      category: "follow_up",
      application: null,
      classificationStatus: "classified",
    });

    const res = await request(app)
      .post(`/api/gmail/emails/${email._id}/apply-status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "interview" });

    expect(res.status).toBe(400);
  });

  it("explicitly updates the linked application status after approval", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    const job = await createJob();
    const application = await Application.create({
      user: userId,
      job: job._id,
      status: "applied",
    });
    const email = await CareerEmail.create({
      user: userId,
      gmailMessageId: "msg1",
      category: "interview_invitation",
      application: application._id,
      classificationStatus: "classified",
    });

    const res = await request(app)
      .post(`/api/gmail/emails/${email._id}/apply-status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "interview" });

    expect(res.status).toBe(200);
    const updated = await Application.findById(application._id);
    expect(updated!.status).toBe("interview");
  });

  it("does not update the application status during sync", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);

    const job = await createJob({ title: "Senior Engineer", companyName: "Acme" });
    const application = await Application.create({
      user: userId,
      job: job._id,
      status: "applied",
    });

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockClaudeAnalyze().mockResolvedValue(classificationJson());

    await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    const updated = await Application.findById(application._id);
    expect(updated!.status).toBe("applied");

    const email = await CareerEmail.findOne({ user: userId });
    expect(email!.suggestedApplicationStatus).toBe("interview");
  });

  it("returns 404 for a missing email intelligence record", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/gmail/emails/invalidid/apply-status")
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "interview" });
    expect(res.status).toBe(404);
  });
});
