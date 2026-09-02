import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import GmailConnection from "../src/models/GmailConnection";
import Profile from "../src/models/Profile";
import { CareerEmail } from "../src/models/CareerEmail";
import Job from "../src/models/Job";
import { Application } from "../src/models/Application";
import ApplicationEvent from "../src/models/ApplicationEvent";
import { encryptToken } from "../src/utils/encryption";
import {
  ALLOWED_AUTO_TRANSITIONS,
  isAllowedStatusTransition,
} from "../src/services/careerStatusTransitions";
import {
  extractCareerEventDeterministic,
  parseTzAwareIso,
  resolveCareerEventExtraction,
} from "../src/services/careerEventExtraction";
import { EmailClassification } from "../src/integrations/claude/emailClassification.types";
import { CareerStatusClassification } from "../src/services/careerStatusDetection";

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
  const sendMessage = jest.fn(() => Promise.resolve({ id: "sent1" }));
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
        sendMessage,
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
      sendMessage: () => sendMessage,
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
const mockSendMessage = () => gmailMocks().sendMessage() as jest.Mock;

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

jest.mock("../src/integrations/ai/geminiClient", () => {
  const analyzeWithGemini = jest.fn();
  return {
    getGeminiModel: jest.fn(() => "gemini-3.6-flash"),
    analyzeWithGemini,
    resetGeminiClient: jest.fn(),
    __getAnalyzeWithGemini: () => analyzeWithGemini,
  };
});
const mockAnalyzeWithGemini = () => {
  const client = require("../src/integrations/ai/geminiClient");
  return client.__getAnalyzeWithGemini() as jest.Mock;
};

jest.mock("../src/integrations/ai/openaiClient", () => {
  const analyzeWithOpenAI = jest.fn();
  return {
    getOpenAIModel: jest.fn(() => "gpt-4o-mini"),
    analyzeWithOpenAI,
    resetOpenAIClient: jest.fn(),
    __getAnalyzeWithOpenAI: () => analyzeWithOpenAI,
  };
});
const mockAnalyzeWithOpenAI = () => {
  const client = require("../src/integrations/ai/openaiClient");
  return client.__getAnalyzeWithOpenAI() as jest.Mock;
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

const careerEventJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "interview",
    confidence: 0.92,
    title: "Technical interview with Acme",
    company: "Acme",
    role: "Senior Engineer",
    scheduledAt: "2026-09-05T14:30:00Z",
    timezone: null,
    durationMinutes: 45,
    interviewerName: "Jane Recruiter",
    interviewerEmail: "jane@acme.com",
    meetingUrl: "https://zoom.us/j/123456",
    meetingPlatform: "zoom",
    location: null,
    phone: null,
    deadlineAt: "2026-09-02T00:00:00Z",
    deadlineTimezone: null,
    actionRequired: true,
    actionText: "Confirm your interview time.",
    candidateResponseRequired: true,
    evidence: "please confirm your interview time",
    ...overrides,
  });

const fullBody = (text: string) => ({
  id: "msg1",
  threadId: "thread1",
  snippet: text.slice(0, 120),
  payload: {
    mimeType: "text/plain",
    body: { data: Buffer.from(text).toString("base64") },
  },
});

beforeAll(async () => {
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "c".repeat(64);
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
  mockSendMessage().mockClear();
  mockAnalyzeWithGemini().mockReset();
  mockAnalyzeWithOpenAI().mockReset();
  mockListMessages().mockResolvedValue([]);
  mockSendMessage().mockResolvedValue({ id: "sent1" });
  mockGetMessageMeta().mockResolvedValue({
    id: "msg1",
    threadId: "thread1",
    subject: "Interview Invitation",
    from: "recruiter@acme.com",
    to: "me@gmail.com",
    snippet: "We would like to invite you to an interview",
    date: "2026-08-27T10:00:00Z",
  });
  mockGetMessageFull().mockResolvedValue(
    fullBody("Interview invitation body")
  );
  mockClaudeAnalyze().mockResolvedValue(classificationJson());
});

const createJob = async (
  overrides: Record<string, unknown> = {}
): Promise<{ _id: unknown }> => {
  return Job.create({
    source: "mock",
    sourceJobId: `j${Date.now()}${Math.random()}`,
    title: "Senior Engineer",
    companyName: "Acme",
    description: "A senior engineering role.",
    ...overrides,
  }) as unknown as Promise<{ _id: unknown }>;
};

const createApplication = async (
  userId: string,
  jobId: unknown,
  status = "applied"
): Promise<{ _id: unknown; status: string }> => {
  return Application.create({
    user: userId,
    job: jobId,
    status,
  }) as unknown as Promise<{ _id: unknown; status: string }>;
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

const enableAutoStatus = async (userId: string) => {
  await Profile.create({
    user: userId,
    gmailNotifyEnabled: true,
    gmailAutoStatusEnabled: true,
  });
};

const runSync = (
  token: string,
  overrides: { meta?: Record<string, unknown>; full?: unknown; claude?: string } = {}
) => {
  if (overrides.meta) mockGetMessageMeta().mockResolvedValue(overrides.meta);
  if (overrides.full) mockGetMessageFull().mockResolvedValue(overrides.full as never);
  if (overrides.claude) mockClaudeAnalyze().mockResolvedValue(overrides.claude);
  mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
  return request(app)
    .post("/api/gmail/sync")
    .set("Authorization", `Bearer ${token}`);
};

const baseClassification = (
  category: EmailClassification["category"],
  overrides: Partial<EmailClassification> = {}
): EmailClassification => ({
  category,
  confidence: 0.9,
  summary: "A career update from Acme.",
  companyName: "Acme",
  jobTitle: "Senior Engineer",
  applicationStatus: null,
  interviewDate: null,
  interviewType: null,
  actionRequired: null,
  actionDeadline: null,
  extractedApplicationHints: {},
  ...overrides,
});

const baseCareerStatus = (
  category: CareerStatusClassification["category"],
  status: CareerStatusClassification["status"],
  overrides: Partial<CareerStatusClassification> = {}
): CareerStatusClassification => ({
  category,
  confidence: 0.9,
  status,
  companyName: "Acme",
  jobTitle: "Senior Engineer",
  actionRequired: null,
  summary: "Detected a hiring-stage signal.",
  evidence: "signal",
  reason: "Matched signal for test.",
  ...overrides,
});

describe("careerEvent invariants", () => {
  it("never exposes applied or withdrawn as an event type", () => {
    for (const from of Object.keys(ALLOWED_AUTO_TRANSITIONS)) {
      const targets = ALLOWED_AUTO_TRANSITIONS[
        from as keyof typeof ALLOWED_AUTO_TRANSITIONS
      ];
      expect(targets).not.toContain("applied");
      expect(targets).not.toContain("withdrawn");
    }
  });

  it("rejects same-status and terminal forward transitions", () => {
    expect(
      isAllowedStatusTransition("interview" as never, "interview" as never)
    ).toBe(false);
    for (const from of ["offer", "rejected", "withdrawn"]) {
      expect(
        isAllowedStatusTransition(from as never, "screening" as never)
      ).toBe(false);
    }
  });
});

describe("parseTzAwareIso date safety", () => {
  it("accepts only explicit timezone offsets or Z", () => {
    expect(parseTzAwareIso("2026-09-05T14:30:00Z")).toBeInstanceOf(Date);
    expect(parseTzAwareIso("2026-09-05T14:30:00+02:00")).toBeInstanceOf(Date);
    expect(parseTzAwareIso("2026-09-05T14:30:00.000Z")).toBeInstanceOf(Date);
  });

  it("rejects naive timestamps so the timezone is never guessed", () => {
    expect(parseTzAwareIso("2026-09-05T14:30:00")).toBeNull();
    expect(parseTzAwareIso("Tomorrow at 2 PM")).toBeNull();
    expect(parseTzAwareIso("09/05/2026 2pm")).toBeNull();
    expect(parseTzAwareIso("")).toBeNull();
    expect(parseTzAwareIso(null)).toBeNull();
  });

  it("never returns an invalid Date", () => {
    expect(parseTzAwareIso("not a date")).toBeNull();
  });
});

describe("extractCareerEventDeterministic", () => {
  it("extracts a structured interview event with interviewer, time, and safe meeting URL", () => {
    const classification = baseClassification("interview_invitation", {
      interviewDate: "2026-09-05T14:30:00Z",
      interview: {
        type: "technical",
        scheduledAt: "2026-09-05T14:30:00Z",
        interviewer: "Jane Recruiter",
        meetingUrl: "https://zoom.us/j/123456",
        location: "Remote",
      },
      actionRequired: true,
      actionDeadline: "2026-09-02T00:00:00Z",
    });
    const status = baseCareerStatus("interview", "interview");

    const event = extractCareerEventDeterministic(
      { subject: "Interview Invitation", body: "Zoom link inside." },
      status,
      classification
    );

    expect(event).not.toBeNull();
    expect(event!.type).toBe("interview");
    expect(event!.scheduledAt).toEqual(new Date("2026-09-05T14:30:00Z"));
    expect(event!.interviewerName).toBe("Jane Recruiter");
    expect(event!.meetingUrl).toBe("https://zoom.us/j/123456");
    expect(event!.meetingPlatform).toBe("zoom");
    expect(event!.deadlineAt).toEqual(new Date("2026-09-02T00:00:00Z"));
    expect(event!.actionRequired).toBe(true);
  });

  it("uses the legacy interviewDate when the interview subdoc is absent", () => {
    const classification = baseClassification("interview_invitation", {
      interviewDate: "2026-09-05T14:30:00Z",
    });
    const event = extractCareerEventDeterministic(
      { subject: "Interview Invitation" },
      baseCareerStatus("interview", "interview"),
      classification
    );
    expect(event?.scheduledAt).toEqual(new Date("2026-09-05T14:30:00Z"));
  });

  it("rejects unsafe meeting URL schemes entirely", () => {
    const classification = baseClassification("interview_invitation", {
      interview: { scheduledAt: "2026-09-05T14:30:00Z", meetingUrl: "javascript:alert(1)" },
    });
    const event = extractCareerEventDeterministic(
      { subject: "Interview Invitation" },
      baseCareerStatus("interview", "interview"),
      classification
    );
    expect(event?.meetingUrl).toBeUndefined();
    expect(event?.meetingPlatform).toBeUndefined();
  });

  it("keeps a naive interview time out of scheduledAt but preserves the timezone text", () => {
    const classification = baseClassification("interview_invitation", {
      interview: { scheduledAt: "2026-09-05T14:30:00" },
    });
    const event = extractCareerEventDeterministic(
      { subject: "Interview Invitation" },
      baseCareerStatus("interview", "interview"),
      classification
    );
    expect(event?.scheduledAt).toBeUndefined();
    expect(event?.timezone).toBe("2026-09-05T14:30:00");
  });

  it("marks a shortlist explicitly instead of collapsing into screening", () => {
    const event = extractCareerEventDeterministic(
      { subject: "You have been shortlisted for the role" },
      baseCareerStatus("screening", "screening"),
      baseClassification("application_update")
    );
    expect(event?.type).toBe("shortlist");
  });

  it("detects an assessment from classification category", () => {
    const event = extractCareerEventDeterministic(
      { subject: "Coding challenge" },
      baseCareerStatus("irrelevant", null),
      baseClassification("assessment")
    );
    expect(event?.type).toBe("assessment");
  });

  it("maps offer, rejection and recruiter outreach to typed events", () => {
    const offer = extractCareerEventDeterministic(
      { subject: "Job offer from Acme" },
      baseCareerStatus("offer", "offer"),
      baseClassification("offer")
    );
    expect(offer?.type).toBe("offer");

    const rejection = extractCareerEventDeterministic(
      { subject: "Regret to inform you about your application" },
      baseCareerStatus("rejection", "rejected"),
      baseClassification("rejection")
    );
    expect(rejection?.type).toBe("rejection");

    const contact = extractCareerEventDeterministic(
      { subject: "We found your profile" },
      baseCareerStatus("recruiter_contact", null),
      baseClassification("recruiter_outreach")
    );
    expect(contact?.type).toBe("recruiter_contact");
  });

  it("returns null when no signal exists at all", () => {
    const event = extractCareerEventDeterministic(
      { subject: "Weekly newsletter" },
      baseCareerStatus("irrelevant", null),
      baseClassification("unrelated")
    );
    expect(event).toBeNull();
  });
});

describe("resolveCareerEventExtraction resilience", () => {
  it("skips AI entirely for an already high-confidence deterministic event", async () => {
    const calls = mockClaudeAnalyze().mock.calls.length;
    const result = await resolveCareerEventExtraction(
      { subject: "Job offer from Acme" },
      baseCareerStatus("offer", "offer"),
      baseClassification("offer")
    );
    expect(result?.type).toBe("offer");
    expect(mockClaudeAnalyze().mock.calls.length).toBe(calls);
  });

  it("falls back to the deterministic result when AI output is malformed JSON", async () => {
    mockClaudeAnalyze().mockResolvedValue("definitely not json {");
    const result = await resolveCareerEventExtraction(
      { subject: "We found your profile" },
      baseCareerStatus("recruiter_contact", null),
      baseClassification("recruiter_outreach")
    );
    expect(result?.type).toBe("recruiter_contact");
  });

  it("falls back to the deterministic result when AI throws", async () => {
    mockClaudeAnalyze().mockRejectedValue(new Error("provider down"));
    const result = await resolveCareerEventExtraction(
      { subject: "Coding challenge" },
      baseCareerStatus("irrelevant", null),
      baseClassification("assessment")
    );
    expect(result?.type).toBe("assessment");
  });

  it("refuses hallucinated event types from AI and keeps the deterministic result", async () => {
    mockClaudeAnalyze().mockResolvedValue(
      careerEventJson({ type: "be rich", confidence: 0.99 })
    );
    const result = await resolveCareerEventExtraction(
      { subject: "We found your profile" },
      baseCareerStatus("recruiter_contact", null),
      baseClassification("recruiter_outreach")
    );
    expect(result?.type).toBe("recruiter_contact");
  });

  it("uses a valid AI event as an upgrade, sanitizing URLs and dates", async () => {
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    const prevGemini = process.env.GEMINI_API_KEY;
    const prevOpenAI = process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
    try {
      mockClaudeAnalyze().mockResolvedValue(
        careerEventJson({
          scheduledAt: "2026-09-05T14:30:00Z",
          meetingUrl: "javascript:alert(1)",
          interviewerEmail: "jane@acme.com",
          interviewerName: "Jane Recruiter",
        })
      );
      const result = await resolveCareerEventExtraction(
        { subject: "We found your profile" },
        baseCareerStatus("recruiter_contact", null),
        baseClassification("recruiter_outreach")
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe("interview");
      expect(result!.scheduledAt).toEqual(new Date("2026-09-05T14:30:00Z"));
      expect(result!.meetingUrl).toBeUndefined();
      expect(result!.interviewerEmail).toBe("jane@acme.com");
      expect(result!.interviewerName).toBe("Jane Recruiter");
    } finally {
      if (prevAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevAnthropic;
      if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevGemini;
      if (prevOpenAI === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevOpenAI;
    }
  });

  it("drops AI deadlines that are naive instead of guessing a timezone", async () => {
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    const prevGemini = process.env.GEMINI_API_KEY;
    const prevOpenAI = process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
    try {
      mockClaudeAnalyze().mockResolvedValue(
        careerEventJson({ deadlineAt: "2026-09-02T00:00:00", type: "offer" })
      );
      const result = await resolveCareerEventExtraction(
        { subject: "Application received" },
        baseCareerStatus("application_update", null, { confidence: 0.5 }),
        baseClassification("application_update")
      );
      expect(result?.type).toBe("offer");
      expect(result?.deadlineAt).toBeUndefined();
    } finally {
      if (prevAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevAnthropic;
      if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevGemini;
      if (prevOpenAI === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevOpenAI;
    }
  });
});

describe("Gmail sync career-event flow", () => {
  it("persists an interview event and creates a namespaced timeline event + one notification", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id, "applied");

    const res = await runSync(token, {
      meta: { subject: "Interview Invitation", from: "recruiter@acme.com" },
      full: fullBody("We would like to invite you to an interview."),
      claude: classificationJson(),
    });

    expect(res.status).toBe(200);
    expect(res.body.careerEvents).toBe(1);

    const email = await CareerEmail.findOne({
      user: userId,
      gmailMessageId: "msg1",
    });
    expect(email!.careerEvent).toBeTruthy();
    expect(email!.careerEvent!.type).toBe("interview");
    expect(email!.careerEvent!.scheduledAt).toEqual(
      new Date("2026-09-01T10:00:00Z")
    );
    expect(email!.careerEvent!.company).toBe("Acme");

    const statusEvent = await ApplicationEvent.findOne({
      application: application._id,
      source: "gmail",
      sourceId: "msg1",
    });
    expect(statusEvent).toBeTruthy();
    expect(statusEvent!.type).toBe("interview_scheduled");

    const careerEventRow = await ApplicationEvent.findOne({
      application: application._id,
      source: "gmail",
      sourceId: "msg1:career-interview",
    });
    expect(careerEventRow).toBeTruthy();
    expect(careerEventRow!.type).toBe("interview_scheduled");

    expect(mockSendMessage()).toHaveBeenCalledTimes(1);
  });

  it("does not collide the career-event sourceId with the status-change sourceId", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id, "applied");

    const res = await runSync(token, {
      meta: { subject: "Interview Invitation", from: "recruiter@acme.com" },
      full: fullBody("We would like to invite you to an interview"),
      claude: classificationJson(),
    });
    expect(res.status).toBe(200);
    expect(res.body.autoUpdated).toBe(1);

    const emails = await ApplicationEvent.find({
      application: application._id,
      source: "gmail",
    });
    expect(emails.length).toBe(2);
    const sourceIds = emails.map((e) => e.sourceId).sort();
    expect(sourceIds).toEqual(["msg1", "msg1:career-interview"]);
  });

  it("re-running sync never duplicates career events or notifications", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id, "applied");

    const first = await runSync(token);
    expect(first.body.classified).toBe(1);

    const second = await runSync(token);
    expect(second.body.skipped).toBe(1);
    expect(second.body.classified).toBe(0);
    expect(second.body.careerEvents).toBe(0);

    const careerEventRows = await ApplicationEvent.find({
      application: application._id,
      source: "gmail",
      sourceId: "msg1:career-interview",
    });
    expect(careerEventRows.length).toBe(1);
    expect(mockSendMessage()).toHaveBeenCalledTimes(1);
  });

  it("detects a shortlist event and still auto-advances as screening", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id, "applied");

    const res = await runSync(token, {
      meta: {
        subject: "You have been shortlisted for the role",
        from: "recruiter@acme.com",
      },
      full: fullBody("Congratulations, you have been shortlisted for the Senior Engineer role at Acme."),
      claude: classificationJson({ category: "application_update" }),
    });

    expect(res.status).toBe(200);
    expect(res.body.careerEvents).toBe(1);

    const email = await CareerEmail.findOne({ user: userId, gmailMessageId: "msg1" });
    expect(email!.careerEvent!.type).toBe("shortlist");
    expect(email!.careerStatus).toBe("screening");

    const refreshed = await Application.findById(application._id);
    expect(refreshed!.status).toBe("screening");
  });

  it("detects assessment, application_update and recruiter_contact events", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);

    const run = async (
      messageId: string,
      meta: { subject: string },
      full: unknown,
      claude: string
    ) => {
      mockListMessages().mockResolvedValue([
        { id: messageId, threadId: "threadA" },
      ]);
      mockGetMessageMeta().mockResolvedValue({
        id: messageId,
        threadId: "threadA",
        ...meta,
        from: "recruiter@acme.com",
        to: "me@gmail.com",
        snippet: meta.subject,
        date: "2026-08-27T10:00:00Z",
      });
      mockGetMessageFull().mockResolvedValue(full as never);
      mockClaudeAnalyze().mockResolvedValue(claude);
      return request(app)
        .post("/api/gmail/sync")
        .set("Authorization", `Bearer ${token}`);
    };

    await run(
      "msgA",
      { subject: "Coding challenge for Acme" },
      fullBody("Please complete the coding challenge by Friday."),
      classificationJson({ category: "assessment" })
    );
    const assessment = await CareerEmail.findOne({ user: userId, gmailMessageId: "msgA" });
    expect(assessment!.careerEvent!.type).toBe("assessment");

    await run(
      "msgB",
      { subject: "Application received" },
      fullBody("We have received your application and are reviewing it."),
      classificationJson({ category: "application_update" })
    );
    const update = await CareerEmail.findOne({ user: userId, gmailMessageId: "msgB" });
    expect(update!.careerEvent!.type).toBe("application_update");

    await run(
      "msgC",
      { subject: "We found your profile" },
      fullBody("We came across your profile and have a job opportunity."),
      classificationJson({ category: "recruiter_outreach" })
    );
    const contact = await CareerEmail.findOne({ user: userId, gmailMessageId: "msgC" });
    expect(contact!.careerEvent!.type).toBe("recruiter_contact");

    const total = await CareerEmail.countDocuments({ user: userId });
    expect(total).toBe(3);
  });

  it("never sets applied/withdrawn and never auto-advances a terminal application", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id, "offer");

    const res = await runSync(token, {
      meta: { subject: "Interview Invitation" },
      full: fullBody("We would like to invite you to an interview."),
      claude: classificationJson(),
    });

    expect(res.body.autoUpdated).toBe(0);
    const refreshed = await Application.findById(application._id);
    expect(refreshed!.status).toBe("offer");
    const email = await CareerEmail.findOne({ user: userId, gmailMessageId: "msg1" });
    expect(email!.careerStatus).toBe("interview");
    expect(email!.autoStatusApplied).toBe(false);
  });

  it("does not leak raw bodies or credentials into timeline or list responses", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id, "applied");

    const secret = "SUPER-SECRET-PASS-1234567890";
    const res = await runSync(token, {
      meta: { subject: "Interview Invitation", from: "recruiter@acme.com" },
      full: fullBody(
        `We would like to invite you to an interview. Join at https://zoom.us/j/9.

Best,
Acme Recruiting

Meeting details:
Password: ${secret}`
      ),
      claude: classificationJson({
        interview: {
          scheduledAt: "2026-09-05T14:30:00Z",
          meetingUrl: "https://zoom.us/j/9",
        },
      }),
    });
    expect(res.status).toBe(200);

    const emailDoc = await CareerEmail.findOne({ user: userId, gmailMessageId: "msg1" }).lean();
    expect(JSON.stringify(emailDoc)).not.toContain(secret);

    const list = await request(app)
      .get("/api/gmail/emails?limit=10")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(secret);
    expect(JSON.stringify(list.body)).not.toContain("rawMetadata");
    const email = list.body.emails[0];
    expect(email.careerEvent.type).toBe("interview");
    expect(email.careerEvent.meetingUrl).toBe("https://zoom.us/j/9");

    const appsRes = await request(app)
      .get("/api/applications")
      .set("Authorization", `Bearer ${token}`);
    expect(appsRes.status).toBe(200);
    const foundApp = appsRes.body.applications.find(
      (a: { _id: unknown }) => String(a._id) === String(application._id)
    );
    expect(foundApp.latestCareerEvent.type).toBe("interview");
    expect(foundApp.latestCareerEvent.scheduledAt).toEqual(
      "2026-09-01T10:00:00.000Z"
    );
    expect(JSON.stringify(appsRes.body)).not.toContain(secret);
  });

  it("keeps a naive meeting time out of scheduledAt during a full sync", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    const job = await createJob();
    await createApplication(userId, job._id, "applied");

    const res = await runSync(token, {
      meta: { subject: "Interview Invitation" },
      full: fullBody("Your interview is tomorrow at 2 PM. Join here."),
      claude: classificationJson({
        interviewDate: "2026-09-05T14:30:00",
        interview: { scheduledAt: "2026-09-05T14:30:00", location: "Remote" },
      }),
    });
    expect(res.status).toBe(200);

    const email = await CareerEmail.findOne({ user: userId, gmailMessageId: "msg1" });
    expect(email!.careerEvent!.type).toBe("interview");
    expect(email!.careerEvent!.scheduledAt).toBeNull();
    expect(email!.careerEvent!.timezone).toBe("2026-09-05T14:30:00");
  });

  it("keeps email processing intact when the self-notification send fails", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id, "applied");

    mockSendMessage().mockRejectedValue(new Error("SMTP boom"));

    const res = await runSync(token, {
      meta: { subject: "Interview Invitation" },
      full: fullBody("We would like to invite you to an interview."),
      claude: classificationJson(),
    });

    expect(res.status).toBe(200);
    expect(res.body.classified).toBe(1);
    expect(res.body.autoUpdated).toBe(1);

    const refreshed = await Application.findById(application._id);
    expect(refreshed!.status).toBe("interview");
    const email = await CareerEmail.findOne({ user: userId, gmailMessageId: "msg1" });
    expect(email!.careerEvent!.type).toBe("interview");
  });
});

describe("application linking precedence for career events", () => {
  it("links to the exact company+title application and leaves ambiguity unlinked", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);

    const acmeSenior = await createJob({ companyName: "Acme", title: "Senior Engineer" });
    const acmeJunior = await createJob({ companyName: "Acme", title: "Junior Engineer" });
    const seniorApp = await createApplication(userId, acmeSenior._id, "applied");
    const juniorApp = await createApplication(userId, acmeJunior._id, "applied");

    const res = await runSync(token, {
      meta: { subject: "Offer from Acme", from: "recruiter@acme.com" },
      full: fullBody("We are pleased to offer you the Senior Engineer position."),
      claude: classificationJson({ category: "offer" }),
    });
    expect(res.status).toBe(200);

    const email = await CareerEmail.findOne({ user: userId, gmailMessageId: "msg1" });
    expect(String(email!.application)).toBe(String(seniorApp._id));
    expect(email!.careerEvent!.type).toBe("offer");
  });

  it("falls back to a company-only match when exactly one application qualifies", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);

    const beta = await createJob({ companyName: "Beta", title: "Platform Engineer" });
    const application = await createApplication(userId, beta._id, "applied");

    const res = await runSync(token, {
      meta: { subject: "Interview at Beta" },
      full: fullBody("We would like to invite you to an interview."),
      claude: classificationJson({ companyName: "Beta", jobTitle: null }),
    });
    expect(res.status).toBe(200);

    const email = await CareerEmail.findOne({ user: userId, gmailMessageId: "msg1" });
    expect(String(email!.application)).toBe(String(application._id));
  });

  it("leaves the email unlinked when multiple applications match the company only", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);

    await createJob({ companyName: "Gamma", title: "Engineer A" });
    await createJob({ companyName: "Gamma", title: "Engineer B" });
    await createApplication(userId, (await createJob({ companyName: "Gamma", title: "Engineer A" }))._id, "applied");
    await createApplication(userId, (await createJob({ companyName: "Gamma", title: "Engineer B" }))._id, "applied");

    const res = await runSync(token, {
      meta: { subject: "Recruiter from Gamma" },
      full: fullBody("We came across your profile and have an opportunity."),
      claude: classificationJson({ category: "recruiter_outreach", companyName: "Gamma", jobTitle: null }),
    });
    expect(res.status).toBe(200);

    const email = await CareerEmail.findOne({ user: userId, gmailMessageId: "msg1" });
    expect(email!.application).toBeNull();
    expect(email!.careerEvent!.type).toBe("recruiter_contact");
  });
});

describe("cross-user isolation for career events", () => {
  it("never leaks one user's career events to another user", async () => {
    const userA = await registerUser();
    const userIdA = (userA.user as { id: string }).id;
    await connectGmail(userIdA);

    const resA = await runSync(userA.token, {
      meta: { subject: "Interview Invitation" },
      full: fullBody("We would like to invite you to an interview."),
      claude: classificationJson(),
    });
    expect(resA.status).toBe(200);

    const email = await CareerEmail.findOne({ user: userIdA, gmailMessageId: "msg1" });
    const emailId = String(email!._id);

    const userB = await registerSecondUser();
    const tokenB = userB.token;

    const listB = await request(app)
      .get("/api/gmail/emails?limit=10")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(listB.status).toBe(200);
    expect(listB.body.emails.length).toBe(0);

    const getB = await request(app)
      .get(`/api/gmail/emails/${emailId}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(getB.status).toBe(404);
  });
});