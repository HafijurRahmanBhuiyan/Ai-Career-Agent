import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser } from "./helpers";
import GmailConnection from "../src/models/GmailConnection";
import Profile from "../src/models/Profile";
import { CareerEmail } from "../src/models/CareerEmail";
import Job from "../src/models/Job";
import { Application } from "../src/models/Application";
import ApplicationEvent from "../src/models/ApplicationEvent";
import User from "../src/models/User";
import { Role } from "../src/types";
import { encryptToken } from "../src/utils/encryption";
import {
  classifyCareerStatusDeterministic,
  resolveCareerStatus,
} from "../src/services/careerStatusDetection";
import {
  ALLOWED_AUTO_TRANSITIONS,
  HIGH_CONFIDENCE,
  isAllowedStatusTransition,
  isDetectedStatusTarget,
} from "../src/services/careerStatusTransitions";
import * as aiRouter from "../src/integrations/ai/aiRouter";

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

const aiStatusJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    category: "interview",
    confidence: 0.9,
    status: "interview",
    companyName: "Acme",
    jobTitle: "Senior Engineer",
    actionRequired: true,
    summary: "Advanced to interview stage.",
    evidence: "invite you to an interview",
    reason: "Evidence strongly suggests an interview invitation.",
    ...overrides,
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
  mockGetMessageFull().mockResolvedValue({
    id: "msg1",
    threadId: "thread1",
    snippet: "Interview",
    payload: {
      mimeType: "text/plain",
      body: { data: Buffer.from("Interview invitation body").toString("base64") },
    },
  });
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

const fetchEmail = async (userId: string, messageId = "msg1") => {
  return CareerEmail.findOne({ user: userId, gmailMessageId: messageId });
};

const adminToken = async () => {
  const email = `admin-${Date.now()}@example.com`;
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ name: "Admin", email, password: "securePassword123" })
    .expect(201);
  const userId = (reg.body.user as { id: string }).id;
  await User.updateOne({ _id: userId }, { $set: { role: Role.ADMIN } });
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "securePassword123" })
    .expect(200);
  return login.body.token as string;
};

describe("careerStatusTransitions invariants", () => {
  it("never allows automatic transitions to applied or withdrawn", () => {
    for (const from of Object.keys(ALLOWED_AUTO_TRANSITIONS)) {
      const targets = ALLOWED_AUTO_TRANSITIONS[
        from as keyof typeof ALLOWED_AUTO_TRANSITIONS
      ];
      expect(targets).not.toContain("applied");
      expect(targets).not.toContain("withdrawn");
    }
  });

  it("treats rejected, offer and withdrawn as terminal", () => {
    for (const from of ["rejected", "offer", "withdrawn"]) {
      for (const to of ["screening", "interview", "offer", "rejected"]) {
        expect(isAllowedStatusTransition(from as never, to as never)).toBe(false);
      }
    }
  });

  it("rejects same-status transitions", () => {
    expect(
      isAllowedStatusTransition("interview" as never, "interview" as never)
    ).toBe(false);
  });

  it("allows forward-only detected-stage moves", () => {
    expect(isAllowedStatusTransition("saved" as never, "screening" as never)).toBe(true);
    expect(isAllowedStatusTransition("applied" as never, "interview" as never)).toBe(true);
    expect(isAllowedStatusTransition("screening" as never, "offer" as never)).toBe(true);
    expect(isAllowedStatusTransition("interview" as never, "rejected" as never)).toBe(true);
  });

  it("validates detected-status targets", () => {
    expect(isDetectedStatusTarget("interview")).toBe(true);
    expect(isDetectedStatusTarget("applied")).toBe(false);
    expect(isDetectedStatusTarget("withdrawn")).toBe(false);
    expect(isDetectedStatusTarget(null)).toBe(false);
  });
});

describe("classifyCareerStatusDeterministic", () => {
  it("detects an explicit offer at HIGH confidence", () => {
    const result = classifyCareerStatusDeterministic({
      subject: "Job Offer - Senior Engineer at Acme",
      body: "We are pleased to offer you the position of Senior Engineer at Acme.",
      from: "recruiter@acme.com",
    });
    expect(result.category).toBe("offer");
    expect(result.status).toBe("offer");
    expect(result.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
    expect(result.companyName).toBe("acme");
  });

  it("detects a rejection that has career context at HIGH confidence", () => {
    const result = classifyCareerStatusDeterministic({
      snippet:
        "We regret to inform you that we will not be moving forward with your application for the role.",
      body: "After careful review, another candidate was selected for the position.",
      from: "hr@acme.com",
    });
    expect(result.category).toBe("rejection");
    expect(result.status).toBe("rejected");
    expect(result.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
  });

  it("never flags a naked 'unfortunately' as a rejection", () => {
    const result = classifyCareerStatusDeterministic({
      subject: "Thank you for applying",
      body: "Unfortunately we have had a large number of applicants.",
    });
    expect(result.category).toBe("irrelevant");
    expect(result.status).toBeNull();
  });

  it("detects an explicit interview invitation at HIGH confidence", () => {
    const result = classifyCareerStatusDeterministic({
      subject: "Interview Invitation",
      snippet: "We would like to invite you to an interview with our team.",
    });
    expect(result.category).toBe("interview");
    expect(result.status).toBe("interview");
    expect(result.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
  });

  it("detects a medium-confidence forward step (next steps)", () => {
    const result = classifyCareerStatusDeterministic({
      subject: "Update on your application",
      body: "Great news! We are happy to move forward with your application.",
    });
    expect(result.category).toBe("interview");
    expect(result.status).toBe("interview");
    expect(result.confidence).toBeLessThan(HIGH_CONFIDENCE);
  });

  it("detects shortlisting as screening at HIGH confidence", () => {
    const result = classifyCareerStatusDeterministic({
      subject: "You have been shortlisted",
      snippet: "Congratulations, you have been shortlisted for the role.",
    });
    expect(result.category).toBe("screening");
    expect(result.status).toBe("screening");
    expect(result.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
  });

  it("detects a phone screen as screening", () => {
    const result = classifyCareerStatusDeterministic({
      subject: "Scheduling",
      body: "Let us set up a quick phone screen to talk about the role.",
    });
    expect(result.category).toBe("screening");
    expect(result.status).toBe("screening");
  });

  it("detects an application received acknowledgement with no status", () => {
    const result = classifyCareerStatusDeterministic({
      subject: "Application received",
      body: "Thank you, we have received your application and it is under review.",
    });
    expect(result.category).toBe("application_update");
    expect(result.status).toBeNull();
  });

  it("detects recruiter outreach with no status", () => {
    const result = classifyCareerStatusDeterministic({
      subject: "Opportunity",
      snippet: "We came across your profile and would like to talk about a role.",
    });
    expect(result.category).toBe("recruiter_contact");
    expect(result.status).toBeNull();
  });

  it("returns irrelevant for non-career email", () => {
    const result = classifyCareerStatusDeterministic({
      subject: "Dinner plans this weekend?",
      body: "Should we get tacos?",
    });
    expect(result.category).toBe("irrelevant");
    expect(result.status).toBeNull();
  });

  it("ignores footer/disclaimer noise beyond the scan window", () => {
    const noise =
      "This message is an automated job alert from our sponsorship newsletters. ".repeat(50);
    const body = noise + " We are pleased to offer you the position today.";
    const result = classifyCareerStatusDeterministic({ subject: "Newsletter", body });
    expect(result.category).toBe("irrelevant");
  });
});

describe("resolveCareerStatus", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("prefers the deterministic HIGH signal and never calls AI", async () => {
    const spy = jest.spyOn(aiRouter, "analyzeWithAIFallback");
    const result = await resolveCareerStatus({
      subject: "Interview Invitation",
      snippet: "We would like to invite you to an interview.",
    });
    expect(result.status).toBe("interview");
    expect(spy).not.toHaveBeenCalled();
  });

  it("lets a higher-confidence AI result upgrade a medium deterministic signal", async () => {
    const spy = jest.spyOn(aiRouter, "analyzeWithAIFallback").mockResolvedValue({
      text: aiStatusJson({ confidence: 0.92, status: "interview" }),
      provider: "claude",
      model: "test-model",
    });
    const result = await resolveCareerStatus({
      subject: "Update on your application",
      body: "We are happy to move forward with your application.",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.category).toBe("interview");
    expect(result.status).toBe("interview");
    expect(result.confidence).toBe(0.92);
  });

  it("falls back to deterministic when AI returns invalid JSON", async () => {
    jest.spyOn(aiRouter, "analyzeWithAIFallback").mockResolvedValue({
      text: "not json {{{",
      provider: "claude",
      model: "test-model",
    });
    const result = await resolveCareerStatus({
      subject: "Application received",
      snippet: "We have received your application for review.",
    });
    expect(result.category).toBe("application_update");
    expect(result.status).toBeNull();
  });

  it("falls back to deterministic when the AI provider throws", async () => {
    jest
      .spyOn(aiRouter, "analyzeWithAIFallback")
      .mockRejectedValue(new Error("all providers down"));
    const result = await resolveCareerStatus({
      subject: "Opportunity",
      snippet: "We found your profile and have an opening for you.",
    });
    expect(result.category).toBe("recruiter_contact");
    expect(result.status).toBeNull();
  });

  it("never returns applied or withdrawn as a detected status", async () => {
    for (const forbidden of ["applied", "withdrawn"]) {
      const spy = jest
        .spyOn(aiRouter, "analyzeWithAIFallback")
        .mockResolvedValue({
          text: aiStatusJson({ status: forbidden, confidence: 0.99 }),
          provider: "claude",
          model: "test-model",
        });
      const result = await resolveCareerStatus({
        subject: "Update on your application",
        body: "We are happy to move forward with your application.",
      });
      expect(result.status).not.toBe(forbidden);
      expect(result.status).toBeNull();
      spy.mockRestore();
    }
  });

  it("strips status from categories that are not status-only", async () => {
    jest.spyOn(aiRouter, "analyzeWithAIFallback").mockResolvedValue({
      text: aiStatusJson({ category: "application_update", confidence: 0.99 }),
      provider: "claude",
      model: "test-model",
    });
    const result = await resolveCareerStatus({
      subject: "Application received",
      snippet: "We have received your application.",
    });
    expect(result.category).toBe("application_update");
    expect(result.status).toBeNull();
  });
});

describe("AI provider fallback (claude -> gemini -> openai)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses gemini when claude fails", async () => {
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    const prevGemini = process.env.GEMINI_API_KEY;
    const prevOpenAI = process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
    try {
      mockClaudeAnalyze().mockRejectedValue(new Error("claude quota exhausted"));
      mockAnalyzeWithGemini().mockResolvedValue({
        text: aiStatusJson(),
        provider: "gemini",
        model: "gemini-3.6-flash",
      });

      const response = await aiRouter.analyzeWithAIFallback({
        systemPrompt: "Sys",
        userMessage: "User",
      });
      expect(response.provider).toBe("gemini");
      expect(JSON.parse(response.text).status).toBe("interview");
    } finally {
      restoreEnv("ANTHROPIC_API_KEY", prevAnthropic);
      restoreEnv("GEMINI_API_KEY", prevGemini);
      restoreEnv("OPENAI_API_KEY", prevOpenAI);
      mockClaudeAnalyze().mockResolvedValue(classificationJson());
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("Gmail sync automatic tracking (opt-in)", () => {
  it("does not change application status when the toggle is off (human-in-the-loop default)", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id, "applied");

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.autoUpdated).toBe(0);

    const refreshed = await Application.findById(application._id);
    expect(refreshed!.status).toBe("applied");

    const email = await fetchEmail(userId);
    expect(email!.careerStatus).toBe("interview");
    expect(email!.careerStatusConfidence).toBe(0.9);
    expect(email!.autoStatusApplied).toBe(false);
  });

  it("auto-advances a matched application to interview and records a status_changed event", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id, "applied");

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.autoUpdated).toBe(1);
    expect(res.body.classified).toBe(1);

    const refreshed = await Application.findById(application._id);
    expect(refreshed!.status).toBe("interview");

    const email = await fetchEmail(userId);
    expect(email!.careerStatus).toBe("interview");
    expect(email!.autoStatusApplied).toBe(true);
    expect(email!.autoStatusReason).toBeTruthy();

    const event = await ApplicationEvent.findOne({
      application: application._id,
      source: "gmail",
      sourceId: "msg1",
    });
    expect(event).toBeTruthy();
    expect(event!.type).toBe("status_changed");
    expect(event!.title).toContain("interview");
  });

  it("auto-applies a shortlist email as screening", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id, "saved");

    mockGetMessageMeta().mockResolvedValue({
      id: "msg1",
      threadId: "thread1",
      subject: "You have been shortlisted",
      from: "recruiter@acme.com",
      to: "me@gmail.com",
      snippet: "Congratulations, you have been shortlisted for the role.",
      date: "2026-08-27T10:00:00Z",
    });
    mockGetMessageFull().mockResolvedValue({
      id: "msg1",
      threadId: "thread1",
      snippet: "Shortlisted",
      payload: {
        mimeType: "text/plain",
        body: {
          data: Buffer.from(
            "You have been shortlisted for the Senior Engineer role at Acme."
          ).toString("base64"),
        },
      },
    });
    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockClaudeAnalyze().mockResolvedValue(
      classificationJson({ category: "application_update" })
    );

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.autoUpdated).toBe(1);
    const refreshed = await Application.findById(application._id);
    expect(refreshed!.status).toBe("screening");
  });

  it("advances to offer on a high-confidence offer email", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id, "interview");

    mockGetMessageMeta().mockResolvedValue({
      id: "msg1",
      threadId: "thread1",
      subject: "Job Offer - Senior Engineer",
      from: "recruiter@acme.com",
      to: "me@gmail.com",
      snippet: "We would like to offer you the position of Senior Engineer at Acme.",
      date: "2026-08-27T10:00:00Z",
    });
    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockClaudeAnalyze().mockResolvedValue(classificationJson({ category: "offer" }));

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.autoUpdated).toBe(1);
    const refreshed = await Application.findById(application._id);
    expect(refreshed!.status).toBe("offer");
  });

  it("advances to rejected on a high-confidence rejection email", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id, "interview");

    mockGetMessageMeta().mockResolvedValue({
      id: "msg1",
      threadId: "thread1",
      subject: "Update on your application",
      from: "hr@acme.com",
      to: "me@gmail.com",
      snippet:
        "We regret to inform you that we will not be moving forward with your application for the Senior Engineer role.",
      date: "2026-08-27T10:00:00Z",
    });
    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockClaudeAnalyze().mockResolvedValue(classificationJson({ category: "rejection" }));

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.autoUpdated).toBe(1);
    const refreshed = await Application.findById(application._id);
    expect(refreshed!.status).toBe("rejected");
  });

  it("never moves a withdrawn application", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id, "withdrawn");

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.autoUpdated).toBe(0);
    const refreshed = await Application.findById(application._id);
    expect(refreshed!.status).toBe("withdrawn");
  });

  it("never reverts a rejected application", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id, "rejected");

    mockGetMessageMeta().mockResolvedValue({
      id: "msg1",
      threadId: "thread1",
      subject: "Job Offer - Senior Engineer",
      from: "recruiter@acme.com",
      to: "me@gmail.com",
      snippet: "We would like to offer you the position of Senior Engineer at Acme.",
      date: "2026-08-27T10:00:00Z",
    });
    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockClaudeAnalyze().mockResolvedValue(classificationJson({ category: "offer" }));

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.autoUpdated).toBe(0);
    const refreshed = await Application.findById(application._id);
    expect(refreshed!.status).toBe("rejected");
  });

  it("does not auto-update when the matched application is ambiguous", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job1 = await createJob();
    const job2 = await createJob({
      title: "DevOps Engineer",
      sourceJobId: `j2${Date.now()}`,
    });
    await createApplication(userId, job1._id);
    await createApplication(userId, job2._id);

    mockClaudeAnalyze().mockResolvedValue(
      classificationJson({ jobTitle: null, extractedApplicationHints: {} })
    );
    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.autoUpdated).toBe(0);
    const email = await fetchEmail(userId);
    expect(email!.application).toBeNull();
  });

  it("matches on title alone when the company name is absent", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id);

    mockClaudeAnalyze().mockResolvedValue(
      classificationJson({ companyName: null, extractedApplicationHints: {} })
    );
    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.autoUpdated).toBe(1);
    const refreshed = await Application.findById(application._id);
    expect(refreshed!.status).toBe("interview");
  });

  it("falls back to the sender domain for company matching", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job = await createJob({ companyName: "Acme Recruiting" });
    const application = await createApplication(userId, job._id);

    mockClaudeAnalyze().mockResolvedValue(
      classificationJson({ companyName: "Acme", jobTitle: null, extractedApplicationHints: {} })
    );
    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.autoUpdated).toBe(1);
    const refreshed = await Application.findById(application._id);
    expect(refreshed!.status).toBe("interview");
  });

  it("is idempotent across repeated syncs", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id);

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);

    const first = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(first.body.autoUpdated).toBe(1);

    const second = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);
    expect(second.body.skipped).toBe(1);
    expect(second.body.classified).toBe(0);
    expect(second.body.autoUpdated).toBe(0);

    const emails = await CareerEmail.find({ user: userId });
    expect(emails).toHaveLength(1);

    const events = await ApplicationEvent.find({ application: application._id, source: "gmail" });
    const sourceIds = events.map((e) => e.sourceId).sort();
    expect(sourceIds).toEqual(["msg1", "msg1:career-interview"]);
  });

  it("skips emails sent by the agent to itself (loop prevention)", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);

    mockGetMessageMeta().mockResolvedValue({
      id: "msg1",
      threadId: "thread1",
      subject: "[Career Agent] Interview invitation at Acme",
      from: "me@gmail.com",
      to: "me@gmail.com",
      snippet: "We would like to invite you to an interview",
      date: "2026-08-27T10:00:00Z",
    });
    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(1);
    expect(res.body.classified).toBe(0);
    expect(mockClaudeAnalyze()).not.toHaveBeenCalled();
    const email = await CareerEmail.findOne({ user: userId });
    expect(email).toBeNull();
  });

  it("passes an incremental lookback query to the Gmail API and honors max results", async () => {
    process.env.GMAIL_SYNC_MAX_RESULTS = "3";

    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const [cap, query] = mockListMessages().mock.calls[0] as [number, string];
    expect(cap).toBe(3);
    expect(query).toMatch(/^after:\d{4}\/\d{2}\/\d{2}$/);

    delete process.env.GMAIL_SYNC_MAX_RESULTS;
  });

  it("never rolls back a status update when the self-notification fails", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job = await createJob();
    const application = await createApplication(userId, job._id);

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockSendMessage().mockRejectedValue(new Error("gmail.send failed"));

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.autoUpdated).toBe(1);
    expect(res.body.failed).toBe(0);

    const refreshed = await Application.findById(application._id);
    expect(refreshed!.status).toBe("interview");
  });

  it("sends a status-change self-notification with the new status", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    await enableAutoStatus(userId);
    const job = await createJob();
    await createApplication(userId, job._id);

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);
    mockSendMessage().mockClear();

    const res = await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.autoUpdated).toBe(1);
    expect(mockSendMessage()).toHaveBeenCalledTimes(1);
    const [to, subject, body] = mockSendMessage().mock.calls[0] as [
      string,
      string,
      string
    ];
    expect(subject).toContain("Status updated to interview");
    expect(body).toContain("Acme");
    expect(to).toBe("me@gmail.com");
  });

  it("lists career emails including detection metadata", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await connectGmail(userId);
    const job = await createJob();
    await createApplication(userId, job._id);

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);

    await request(app)
      .post("/api/gmail/sync")
      .set("Authorization", `Bearer ${token}`);

    const list = await request(app)
      .get("/api/gmail/emails?limit=10")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    const email = list.body.emails[0] as Record<string, unknown>;
    expect(email.careerStatus).toBe("interview");
    expect(email.careerStatusConfidence).toBe(0.9);
  });
});

describe("Admin bulk sync (POST /api/gmail/sync-all)", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post("/api/gmail/sync-all");
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/gmail/sync-all")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("syncs every connected user and isolates per-user failures", async () => {
    const token = await adminToken();
    const first = await registerUser();
    const second = await registerUser({
      name: "Second User",
      email: "second@example.com",
      password: "securePassword456",
    });
    await connectGmail((first.user as { id: string }).id);
    const job = await createJob();
    await createApplication((first.user as { id: string }).id, job._id);
    await connectGmail((second.user as { id: string }).id);

    mockListMessages().mockResolvedValue([{ id: "msg1", threadId: "thread1" }]);

    const res = await request(app)
      .post("/api/gmail/sync-all")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.users).toBe(2);
    expect(res.body.synced).toBe(2);
    expect(res.body.classified).toBe(2);
    expect(res.body.errors).toHaveLength(0);
  });

  it("returns an empty summary when no connections exist", async () => {
    const token = await adminToken();
    const res = await request(app)
      .post("/api/gmail/sync-all")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toBe(0);
    expect(res.body.synced).toBe(0);
  });
});