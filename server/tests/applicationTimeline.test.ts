import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import GmailConnection from "../src/models/GmailConnection";
import { CareerEmail } from "../src/models/CareerEmail";
import { ApplicationEvent } from "../src/models/ApplicationEvent";
import Job from "../src/models/Job";
import { Application } from "../src/models/Application";
import { encryptToken } from "../src/utils/encryption";
import { createGmailEvent } from "../src/services/applicationTimeline";
import { Types } from "mongoose";

jest.mock("../src/integrations/gmail/gmailClient", () => {
  const getOAuthAuthorizeUrl = jest.fn(() => "https://accounts.google.com/test");
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
  const getProfile = jest.fn(() => Promise.resolve({ emailAddress: "me@gmail.com" }));
  const listMessages = jest.fn(() => Promise.resolve([]));
  const getMessageMeta = jest.fn(() =>
    Promise.resolve({
      id: "msg1",
      threadId: "thread1",
      subject: "Interview Invitation",
      from: "recruiter@acme.com",
      to: "me@gmail.com",
      snippet: "Interview invitation",
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
    getGmailScopes: jest.fn(() => "https://www.googleapis.com/auth/gmail.readonly"),
    GmailClient: Object.assign(
      jest.fn().mockImplementation(() => ({
        getProfile,
        listMessages,
        getMessageMeta,
        getMessageFull,
      })),
      { getOAuthAuthorizeUrl, exchangeCodeForToken, refreshAccessToken }
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

const summaryJson = () =>
  JSON.stringify({
    summary: "Strong application, currently in interview.",
    currentSituation: "The applicant is in the interview stage.",
    strengths: ["Strong technical background"],
    risks: ["Pending coding challenge"],
    nextActions: ["Consider preparing for the technical round"],
  });

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
    interview: {
      type: "technical",
      scheduledAt: "2026-09-01T10:00:00Z",
      interviewer: "Jane Recruiter",
      meetingUrl: "https://meet.example.com/acme",
      location: null,
      notes: "Test your algorithms",
    },
    actionRequired: true,
    actionDeadline: "2026-08-30T00:00:00Z",
    extractedApplicationHints: { companyName: "Acme", jobTitle: "Senior Engineer" },
    ...overrides,
  });

const createJob = async (overrides: Record<string, unknown> = {}) => {
  return Job.create({
    source: "mock",
    sourceJobId: `apptl-${Date.now()}-${Math.random()}`,
    title: "React Developer",
    companyName: "Acme Corp",
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
    jobUrl: "https://example.com/job/at",
    applyUrl: "https://example.com/apply/at",
    rawSource: {},
    lastSeenAt: new Date(),
    discoveredAt: new Date(),
    isActive: true,
    ...overrides,
  });
};

const createApp = async (token: string) => {
  const job = await createJob();
  const res = await request(app)
    .post("/api/applications")
    .set("Authorization", `Bearer ${token}`)
    .send({ jobId: String(job._id) });
  return { id: res.body.application._id as string, jobId: String(job._id) };
};

const connectGmail = async (userId: string) => {
  await GmailConnection.create({
    user: userId,
    googleAccountEmail: "me@gmail.com",
    encryptedAccessToken: encryptToken("ya29_access"),
    encryptedRefreshToken: encryptToken("1//refresh"),
    tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
    scopes: "https://www.googleapis.com/auth/gmail.readonly",
    isActive: true,
  });
};

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
  mockListMessages().mockResolvedValue([]);
  mockGetMessageMeta().mockResolvedValue({
    id: "msg1",
    threadId: "thread1",
    subject: "Interview Invitation",
    from: "recruiter@acme.com",
    to: "me@gmail.com",
    snippet: "Interview invitation",
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

describe("Application timeline - authentication", () => {
  test("GET /timeline requires auth", async () => {
    const res = await request(app).get("/api/applications/507f1f77bcf86cd799439011/timeline");
    expect(res.status).toBe(401);
  });
  test("POST /timeline requires auth", async () => {
    const res = await request(app)
      .post("/api/applications/507f1f77bcf86cd799439011/timeline")
      .send({ type: "note", title: "x", eventDate: "2026-01-01T00:00:00Z" });
    expect(res.status).toBe(401);
  });
  test("PATCH /timeline requires auth", async () => {
    const res = await request(app).patch("/api/applications/507f1f77bcf86cd799439011/timeline/507f1f77bcf86cd799439011");
    expect(res.status).toBe(401);
  });
  test("DELETE /timeline requires auth", async () => {
    const res = await request(app).delete("/api/applications/507f1f77bcf86cd799439011/timeline/507f1f77bcf86cd799439011");
    expect(res.status).toBe(401);
  });
  test("summary endpoints require auth", async () => {
    expect((await request(app).get("/api/applications/507f1f77bcf86cd799439011/summary")).status).toBe(401);
    expect((await request(app).post("/api/applications/507f1f77bcf86cd799439011/summary")).status).toBe(401);
  });
});

describe("Application timeline - status history", () => {
  test("creates application_created event on application create", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .get(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.events[0].type).toBe("application_created");
    expect(res.body.events[0].source).toBe("system");
  });

  test("creates status_changed event on status transition", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    await request(app)
      .patch(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "applied" });

    const res = await request(app)
      .get(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
    const statusEvents = res.body.events.filter(
      (e: { type: string }) => e.type === "status_changed"
    );
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0].title).toBe("Status changed to applied");
  });

  test("does not create a duplicate event when status is unchanged", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    await request(app)
      .patch(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "saved" });

    const res = await request(app)
      .get(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.pagination.total).toBe(1);
    expect(res.body.events[0].type).toBe("application_created");
  });

  test("creating with an explicit status records application_created only", async () => {
    const { token } = await registerUser();
    const job = await createJob();
    const created = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id), status: "interview" });

    const res = await request(app)
      .get(`/api/applications/${created.body.application._id}/timeline`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.pagination.total).toBe(1);
    expect(res.body.events[0].type).toBe("application_created");
  });
});

describe("Application timeline - CRUD", () => {
  test("adds a manual event with source user", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .post(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "note",
        title: "Called recruiter",
        description: "Discussed next steps",
        eventDate: "2026-08-20T00:00:00Z",
      });

    expect(res.status).toBe(201);
    expect(res.body.event.source).toBe("user");
    expect(res.body.event.type).toBe("note");
    expect(res.body.event.title).toBe("Called recruiter");
    expect(res.body.event).not.toHaveProperty("user");
  });

  test("lists events newest first with pagination", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/api/applications/${id}/timeline`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          type: "note",
          title: `Note ${i}`,
          eventDate: `2026-08-${String(20 + i).padStart(2, "0")}T00:00:00Z`,
        });
    }

    const res = await request(app)
      .get(`/api/applications/${id}/timeline?limit=2`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(2);
    expect(res.body.pagination.total).toBe(4);
    expect(res.body.pagination.totalPages).toBe(2);
    expect(res.body.events[0].title).toBe("Application created");
    expect(res.body.events[1].title).toBe("Note 2");
  });

  test("updates an existing user event", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);
    const created = await request(app)
      .post(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "note", title: "Old", eventDate: "2026-08-20T00:00:00Z" });

    const res = await request(app)
      .patch(`/api/applications/${id}/timeline/${created.body.event.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "New title", type: "interview_scheduled" });

    expect(res.status).toBe(200);
    expect(res.body.event.title).toBe("New title");
    expect(res.body.event.type).toBe("interview_scheduled");
  });

  test("deletes an existing user event", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);
    const created = await request(app)
      .post(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "note", title: "Temp", eventDate: "2026-08-20T00:00:00Z" });

    const res = await request(app)
      .delete(`/api/applications/${id}/timeline/${created.body.event.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Timeline event deleted");

    const list = await request(app)
      .get(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.pagination.total).toBe(1);
  });
});

describe("Application timeline - validation", () => {
  test("rejects an invalid event type", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);
    const res = await request(app)
      .post(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "bogus", title: "x", eventDate: "2026-08-20T00:00:00Z" });
    expect(res.status).toBe(422);
  });

  test("rejects a missing title", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);
    const res = await request(app)
      .post(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "note", eventDate: "2026-08-20T00:00:00Z" });
    expect(res.status).toBe(422);
  });

  test("rejects an invalid event date", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);
    const res = await request(app)
      .post(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "note", title: "x", eventDate: "not-a-date" });
    expect(res.status).toBe(422);
  });

  test("rejects unknown fields", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);
    const res = await request(app)
      .post(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "note", title: "x", eventDate: "2026-08-20T00:00:00Z", source: "gmail" });
    expect(res.status).toBe(422);
  });

  test("rejects an empty update body", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);
    const created = await request(app)
      .post(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "note", title: "x", eventDate: "2026-08-20T00:00:00Z" });
    const res = await request(app)
      .patch(`/api/applications/${id}/timeline/${created.body.event.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(422);
  });

  test("rejects a limit above the maximum", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);
    const res = await request(app)
      .get(`/api/applications/${id}/timeline?limit=500`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
  });
});

describe("Application timeline - ownership and source security", () => {
  test("hides another user's timeline as 404 on GET", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .get(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });

  test("returns 404 when adding to another user's application", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .post(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ type: "note", title: "x", eventDate: "2026-08-20T00:00:00Z" });
    expect(res.status).toBe(404);
  });

  test("cannot update or delete a system-generated event", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const list = await request(app)
      .get(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token}`);
    const systemEventId = list.body.events[0].id;

    const patch = await request(app)
      .patch(`/api/applications/${id}/timeline/${systemEventId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "changed" });
    expect(patch.status).toBe(404);

    const del = await request(app)
      .delete(`/api/applications/${id}/timeline/${systemEventId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(404);
  });

  test("cannot update another user's event (cross-user leak prevention)", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const { id } = await createApp(token);
    const created = await request(app)
      .post(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "note", title: "x", eventDate: "2026-08-20T00:00:00Z" });

    const res = await request(app)
      .patch(`/api/applications/${id}/timeline/${created.body.event.id}`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ title: "nope" });
    expect(res.status).toBe(404);
  });

  test("returns 404 for an invalid event id", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);
    const res = await request(app)
      .patch(`/api/applications/${id}/timeline/not-an-id`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "x" });
    expect(res.status).toBe(404);
  });
});

describe("Application timeline - Gmail-derived events", () => {
  test("creates a gmail-derived event idempotently", async () => {
    const { token, user } = await registerUser();
    const { id } = await createApp(token);

    const first = await createGmailEvent(
      user.id as string,
      id,
      { type: "interview_scheduled", title: "Interview", eventDate: new Date(), sourceId: "msg1" }
    );
    const second = await createGmailEvent(
      user.id as string,
      id,
      { type: "interview_scheduled", title: "Interview", eventDate: new Date(), sourceId: "msg1" }
    );

    const count = await ApplicationEvent.countDocuments({
      application: new Types.ObjectId(id),
      source: "gmail",
    });
    expect(count).toBe(1);
    expect(String(first!._id)).toBe(String(second!._id));
  });

  test("creates distinct events for distinct messages", async () => {
    const { token, user } = await registerUser();
    const { id } = await createApp(token);

    await createGmailEvent(user.id as string, id, {
      type: "offer_received",
      title: "Offer A",
      eventDate: new Date(),
      sourceId: "msgA",
    });
    await createGmailEvent(user.id as string, id, {
      type: "rejection_received",
      title: "Rejection B",
      eventDate: new Date(),
      sourceId: "msgB",
    });

    const count = await ApplicationEvent.countDocuments({
      application: new Types.ObjectId(id),
      source: "gmail",
    });
    expect(count).toBe(2);
  });

  test("gmail-derived events cannot be edited or deleted via API", async () => {
    const { token, user } = await registerUser();
    const { id } = await createApp(token);
    await createGmailEvent(user.id as string, id, {
      type: "recruiter_contact",
      title: "Recruiter ping",
      eventDate: new Date(),
      sourceId: "msgRecruiter",
    });

    const list = await request(app)
      .get(`/api/applications/${id}/timeline`)
      .set("Authorization", `Bearer ${token}`);
    const gmailEvent = list.body.events.find(
      (e: { source: string }) => e.source === "gmail"
    );
    expect(gmailEvent).toBeTruthy();

    const patch = await request(app)
      .patch(`/api/applications/${id}/timeline/${gmailEvent.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "tamper" });
    expect(patch.status).toBe(404);

    const del = await request(app)
      .delete(`/api/applications/${id}/timeline/${gmailEvent.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(404);
  });

  test("sync creates a gmail timeline event for a matched application", async () => {
    const { token, user } = await registerUser();
    const job = await createJob({ companyName: "Acme", title: "Senior Engineer" });
    const created = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id) });
    await connectGmail(user.id as string);

    mockListMessages().mockResolvedValue([{ id: "gmsg1" }]);
    mockGetMessageMeta().mockResolvedValue({
      id: "gmsg1",
      threadId: "t1",
      subject: "Interview Invitation",
      from: "recruiter@acme.com",
      to: "me@gmail.com",
      snippet: "We would like to invite you",
      date: "2026-08-27T10:00:00Z",
    });
    mockGetMessageFull().mockResolvedValue({
      id: "gmsg1",
      threadId: "t1",
      payload: {
        mimeType: "text/plain",
        body: { data: Buffer.from("Interview body").toString("base64") },
      },
    });
    mockClaudeAnalyze().mockResolvedValue(
      classificationJson({ interview: { type: "technical", scheduledAt: "2026-09-01T10:00:00Z", interviewer: "Jane", meetingUrl: "https://meet.example.com/x", location: null, notes: "Prepare" } })
    );

    await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const appId = created.body.application._id as string;
    const events = await ApplicationEvent.find({
      application: new Types.ObjectId(appId),
      source: "gmail",
    });
    expect(events.length).toBe(2);
    const careerRow = events.find((e) => e.sourceId === "gmsg1:career-interview");
    expect(careerRow).toBeTruthy();
    expect(careerRow!.type).toBe("interview_scheduled");
    expect(events.find((e) => e.sourceId === "gmsg1")).toBeTruthy();

    await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const count = await ApplicationEvent.countDocuments({
      application: new Types.ObjectId(appId),
      source: "gmail",
      sourceId: "gmsg1",
    });
    expect(count).toBe(1);
  });

  test("persists interview details extracted from email", async () => {
    const { token, user } = await registerUser();
    const job = await createJob({ companyName: "Acme", title: "Senior Engineer" });
    await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id) });
    await connectGmail(user.id as string);

    mockListMessages().mockResolvedValue([{ id: "imsg1" }]);
    mockGetMessageMeta().mockResolvedValue({
      id: "imsg1",
      threadId: "t1",
      subject: "Interview Invitation",
      from: "recruiter@acme.com",
      to: "me@gmail.com",
      snippet: "Interview",
      date: "2026-08-27T10:00:00Z",
    });
    mockGetMessageFull().mockResolvedValue({
      id: "imsg1",
      threadId: "t1",
      payload: {
        mimeType: "text/plain",
        body: { data: Buffer.from("Interview").toString("base64") },
      },
    });
    mockClaudeAnalyze().mockResolvedValue(
      classificationJson({
        interview: {
          type: "video",
          scheduledAt: "2026-09-05T14:00:00Z",
          interviewer: "Bob",
          meetingUrl: "https://meet.example.com/bob",
          location: null,
          notes: null,
        },
      })
    );

    await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const withInterview = await CareerEmail.findOne({ gmailMessageId: "imsg1" });
    expect(withInterview).toBeTruthy();
    const interview = withInterview!.interview as unknown as Record<string, unknown>;
    expect(interview).toBeTruthy();
    expect(interview.scheduledAt).toBeInstanceOf(Date);
    expect(interview.interviewer).toBe("Bob");
    expect(interview.meetingUrl).toBe("https://meet.example.com/bob");
  });

  test("leaves interview null when the email contains no interview details", async () => {
    const { token, user } = await registerUser();
    const job = await createJob({ companyName: "Acme", title: "Senior Engineer" });
    await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id) });
    await connectGmail(user.id as string);

    mockListMessages().mockResolvedValue([{ id: "imsg2" }]);
    mockGetMessageMeta().mockResolvedValue({
      id: "imsg2",
      threadId: "t2",
      subject: "Application update",
      from: "recruiter@acme.com",
      to: "me@gmail.com",
      snippet: "Update",
      date: "2026-08-27T10:00:00Z",
    });
    mockGetMessageFull().mockResolvedValue({
      id: "imsg2",
      threadId: "t2",
      payload: {
        mimeType: "text/plain",
        body: { data: Buffer.from("Update").toString("base64") },
      },
    });
    mockClaudeAnalyze().mockResolvedValue(
      classificationJson({
        category: "application_update",
        applicationStatus: "screening",
        interview: null,
        interviewDate: null,
        interviewType: null,
        extractedApplicationHints: { companyName: "Acme", jobTitle: "Senior Engineer" },
      })
    );

    await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const withoutInterview = await CareerEmail.findOne({ gmailMessageId: "imsg2" });
    expect(withoutInterview!.interview).toBeNull();

    const event = await ApplicationEvent.findOne({ sourceId: "imsg2" });
    expect(event).toBeNull();
  });
});

describe("Application detail API - expanded fields", () => {
  test("returns timeline, emails, jobMatch, interview and aiSummary", async () => {
    const { token, user } = await registerUser();
    const job = await createJob({ companyName: "Acme", title: "Senior Engineer" });
    const created = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobId: String(job._id), status: "interview" });
    const id = created.body.application._id as string;

    await CareerEmail.create({
      user: user.id,
      application: id,
      gmailMessageId: "dirmsg",
      category: "interview_invitation",
      subject: "Interview Invitation",
      receivedAt: new Date("2026-09-01T10:00:00Z"),
      interview: {
        type: "technical",
        scheduledAt: new Date("2026-09-01T10:00:00Z"),
        interviewer: "Jane",
      },
      suggestedApplicationStatus: "interview",
    });

    mockClaudeAnalyze().mockResolvedValue(summaryJson());
    await request(app)
      .post(`/api/applications/${id}/summary`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const res = await request(app)
      .get(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.application._id).toBe(id);
    expect(res.body.timeline.count).toBeGreaterThan(0);
    expect(res.body.emails).toHaveLength(1);
    expect(res.body.emails[0].gmailMessageId).toBe("dirmsg");
    expect(res.body.emails[0]).not.toHaveProperty("rawMetadata");
    expect(res.body.emails[0]).not.toHaveProperty("user");
    expect(res.body.interview.scheduledAt).toBeTruthy();
    expect(res.body.aiSummary).toBeTruthy();
    expect(res.body.aiSummary).not.toHaveProperty("user");
  });

  test("does not leak another user's application details", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const { id } = await createApp(token);
    const res = await request(app)
      .get(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });
});

describe("Application summary - AI behavior", () => {
  test("generates a summary and caches it", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    mockClaudeAnalyze().mockResolvedValue(summaryJson());
    const first = await request(app)
      .post(`/api/applications/${id}/summary`)
      .set("Authorization", `Bearer ${token}`);

    expect(first.status).toBe(200);
    expect(first.body.summary.summary).toContain("interview");
    expect(first.body.summary.strengths).toContain("Strong technical background");
    expect(first.body.cached).toBe(false);

    mockClaudeAnalyze().mockClear();
    const second = await request(app)
      .post(`/api/applications/${id}/summary`)
      .set("Authorization", `Bearer ${token}`);

    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
    expect(mockClaudeAnalyze()).not.toHaveBeenCalled();
  });

  test("returns null summary before generation", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);
    const res = await request(app)
      .get(`/api/applications/${id}/summary`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeNull();
  });

  test("rejects summary generation for another user's application", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const { id } = await createApp(token);
    const res = await request(app)
      .post(`/api/applications/${id}/summary`)
      .set("Authorization", `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });
});
