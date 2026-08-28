import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import Job from "../src/models/Job";
import { Application } from "../src/models/Application";
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

const prepAssistJson = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    suggestedGoals: ["Understand the team's priorities"],
    suggestedTalkingPoints: ["Leadership experience"],
    suggestedQuestionsToAsk: ["What does growth look like here?"],
    suggestedChecklistHighlights: ["company_researched"],
    ...overrides,
  });

const createJob = async (overrides: Record<string, unknown> = {}) => {
  return Job.create({
    source: "mock",
    sourceJobId: `prep-${Date.now()}-${Math.random()}`,
    title: "Senior Engineer",
    companyName: "Acme",
    description: "A senior engineering role.",
    ...overrides,
  });
};

const createApp = async (token: string, status = "interview") => {
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
  mockClaudeAnalyze().mockReset();
  mockClaudeAnalyze().mockResolvedValue("{}");
});

describe("Interview preparation - authentication", () => {
  test("GET requires auth", async () => {
    const res = await request(app).get("/api/applications/507f1f77bcf86cd799439011/preparation");
    expect(res.status).toBe(401);
  });

  test("PUT requires auth", async () => {
    const res = await request(app)
      .put("/api/applications/507f1f77bcf86cd799439011/preparation")
      .send({ notes: "x" });
    expect(res.status).toBe(401);
  });

  test("PATCH requires auth", async () => {
    const res = await request(app)
      .patch("/api/applications/507f1f77bcf86cd799439011/preparation")
      .send({ notes: "x" });
    expect(res.status).toBe(401);
  });
});

describe("Interview preparation - default shape", () => {
  test("returns a default empty preparation when none exists without persisting", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .get(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.preparation.application).toBe(id);
    expect(res.body.preparation.notes).toBeNull();
    expect(res.body.preparation.goals).toEqual([]);
    expect(res.body.preparation.talkingPoints).toEqual([]);
    expect(res.body.preparation.questionsToAsk).toEqual([]);
    expect(res.body.preparation.checklist.length).toBe(7);

    const count = await InterviewPreparation.countDocuments({ application: id });
    expect(count).toBe(0);
  });

  test("default preparation contains all seven checklist keys marked incomplete", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .get(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token}`);

    const keys = res.body.preparation.checklist.map(
      (item: { key: string }) => item.key
    );
    expect(keys).toEqual([
      "resume_reviewed",
      "job_description_reviewed",
      "company_researched",
      "star_stories_prepared",
      "technical_topics_prepared",
      "behavioral_topics_prepared",
      "interviewer_questions_prepared",
    ]);
    expect(
      res.body.preparation.checklist.every(
        (item: { completed: boolean }) => item.completed === false
      )
    ).toBe(true);
  });

  test("returns 404 for a non-existent application", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get("/api/applications/507f1f77bcf86cd799439011/preparation")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("Interview preparation - CRUD", () => {
  test("upserts notes and arrays", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .put(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        notes: "Bring portfolio",
        goals: ["Understand team", "Showcase skills"],
        talkingPoints: ["Leadership", "Ownership"],
        questionsToAsk: ["What does onboarding look like?"],
        companyResearchNotes: "Acme focuses on AI tooling.",
        rolePreparationNotes: "Senior role, lead a squad.",
      });

    expect(res.status).toBe(200);
    expect(res.body.preparation.notes).toBe("Bring portfolio");
    expect(res.body.preparation.goals).toEqual(["Understand team", "Showcase skills"]);
    expect(res.body.preparation.talkingPoints).toEqual(["Leadership", "Ownership"]);
    expect(res.body.preparation.questionsToAsk).toEqual([
      "What does onboarding look like?",
    ]);
    expect(res.body.preparation.companyResearchNotes).toContain("AI tooling");
    expect(res.body.preparation.rolePreparationNotes).toContain("Senior role");
    expect(res.body.preparation).not.toHaveProperty("user");
  });

  test("PATCH updates a subset of fields without overwriting others", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    await request(app)
      .put(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "Original notes", goals: ["Keep me"] });

    const res = await request(app)
      .patch(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "Updated notes" });

    expect(res.status).toBe(200);
    expect(res.body.preparation.notes).toBe("Updated notes");
    expect(res.body.preparation.goals).toEqual(["Keep me"]);
  });

  test("upsert does not create duplicates for repeated writes", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    for (let i = 0; i < 3; i++) {
      await request(app)
        .put(`/api/applications/${id}/preparation`)
        .set("Authorization", `Bearer ${token}`)
        .send({ notes: `note ${i}` })
        .expect(200);
    }

    const count = await InterviewPreparation.countDocuments({ application: id });
    expect(count).toBe(1);
  });

  test("checklist items can be toggled explicitly and completedAt set server-side", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .put(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        checklist: [
          { key: "resume_reviewed", label: "Resume reviewed", completed: true },
          { key: "company_researched", label: "Company researched", completed: false },
        ],
      });

    expect(res.status).toBe(200);
    const checklist = res.body.preparation.checklist;
    expect(checklist).toHaveLength(2);
    const resume = checklist.find((c: { key: string }) => c.key === "resume_reviewed");
    const company = checklist.find((c: { key: string }) => c.key === "company_researched");
    expect(resume.completed).toBe(true);
    expect(resume.completedAt).toBeTruthy();
    expect(company.completed).toBe(false);
    expect(company.completedAt).toBeNull();
  });
});

describe("Interview preparation - ownership", () => {
  test("another user cannot see another's preparation (404)", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .get(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });

  test("another user cannot write to another's preparation (404)", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .put(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ notes: "tamper" });
    expect(res.status).toBe(404);
  });

  test("cross-user preparation data is never returned", async () => {
    const { token, user } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const { id } = await createApp(token);

    await InterviewPreparation.create({
      user: user.id,
      application: id,
      notes: "Secret preparation",
    });

    const res = await request(app)
      .get(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token2}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("Secret preparation");
  });
});

describe("Interview preparation - validation", () => {
  test("rejects unknown fields on update", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .put(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "x", socialMediaLinks: ["https://example.com"] });
    expect(res.status).toBe(422);
  });

  test("rejects unknown fields on checklist items", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .put(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token}`)
      .send({ checklist: [{ key: "resume_reviewed", label: "x", completed: true, extra: 1 }] });
    expect(res.status).toBe(422);
  });

  test("rejects an invalid checklist key", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .put(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token}`)
      .send({ checklist: [{ key: "banana", label: "x", completed: true }] });
    expect(res.status).toBe(422);
  });

  test("rejects an empty update body", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .put(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(422);
  });

  test("rejects notes exceeding the maximum length", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .put(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "x".repeat(10001) });
    expect(res.status).toBe(422);
  });

  test("rejects more than 20 goals", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .put(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token}`)
      .send({ goals: Array.from({ length: 21 }, (_, i) => `goal ${i}`) });
    expect(res.status).toBe(422);
  });
});

describe("Interview preparation - detail API integration", () => {
  test("preparation is included in the application detail response", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    await request(app)
      .put(`/api/applications/${id}/preparation`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "Detailed" });

    const res = await request(app)
      .get(`/api/applications/${id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.preparation).toBeTruthy();
    expect(res.body.preparation.notes).toBe("Detailed");
    expect(res.body.preparation).not.toHaveProperty("user");
  });
});

describe("Interview preparation - AI assist", () => {
  test("POST /preparation/assist requires auth", async () => {
    const res = await request(app).post("/api/applications/507f1f77bcf86cd799439011/preparation/assist");
    expect(res.status).toBe(401);
  });

  test("returns suggestions for review without persisting anything", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    mockClaudeAnalyze().mockResolvedValue(prepAssistJson());

    const res = await request(app)
      .post(`/api/applications/${id}/preparation/assist`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.suggestions.suggestedGoals).toContain("Understand the team's priorities");
    expect(res.body.suggestions.suggestedTalkingPoints).toContain("Leadership experience");
    expect(res.body.suggestions.suggestedQuestionsToAsk).toHaveLength(1);

    // Nothing is persisted by the assist call.
    const count = await InterviewPreparation.countDocuments({ application: id });
    expect(count).toBe(0);
  });

  test("returns 404 for another user's application on assist", async () => {
    const { token } = await registerUser();
    const { token: token2 } = await registerSecondUser();
    const { id } = await createApp(token);

    const res = await request(app)
      .post(`/api/applications/${id}/preparation/assist`)
      .set("Authorization", `Bearer ${token2}`);
    expect(res.status).toBe(404);
  });

  test("returns 404 for a non-existent application on assist", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/api/applications/507f1f77bcf86cd799439011/preparation/assist")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test("rejects invalid Claude output with 422", async () => {
    const { token } = await registerUser();
    const { id } = await createApp(token);

    mockClaudeAnalyze().mockResolvedValue(
      JSON.stringify({ suggestedGoals: "not-an-array" })
    );

    const res = await request(app)
      .post(`/api/applications/${id}/preparation/assist`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);

    const count = await InterviewPreparation.countDocuments({ application: id });
    expect(count).toBe(0);
  });
});
