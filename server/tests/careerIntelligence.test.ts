import request from "supertest";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import { CareerEmail } from "../src/models/CareerEmail";
import { ApplicationEvent } from "../src/models/ApplicationEvent";
import Job from "../src/models/Job";
import { Application } from "../src/models/Application";
import { InterviewPreparation } from "../src/models/InterviewPreparation";
import { ApplicationFollowUp } from "../src/models/ApplicationFollowUp";
import { Types } from "mongoose";
import { createStatusChangedEvent } from "../src/services/applicationTimeline";

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
  const getMessageMeta = jest.fn(() => Promise.resolve({}));
  const getMessageFull = jest.fn(() => Promise.resolve({}));
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
    sourceJobId: `ci-${Date.now()}${Math.random()}`,
    title: "Senior Engineer",
    companyName: "Acme",
    description: "A senior engineering role.",
    ...overrides,
  });
};

const createApplication = (
  userId: string,
  jobId: Types.ObjectId,
  status: string,
  overrides: Record<string, unknown> = {}
) => {
  return Application.create({
    user: userId,
    job: jobId,
    status,
    ...overrides,
  });
};

const createEmail = (
  userId: string,
  applicationId: Types.ObjectId,
  overrides: Record<string, unknown> = {}
) => {
  return CareerEmail.create({
    user: userId,
    gmailMessageId: `msg-${Date.now()}${Math.random()}`,
    subject: "Update",
    from: "recruiter@acme.com",
    receivedAt: new Date(),
    category: "application_update",
    ...overrides,
    application: overrides.application ?? applicationId,
  });
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

const getDashboard = (token: string) =>
  request(app).get("/api/dashboard/career-intelligence").set("Authorization", `Bearer ${token}`);

describe("Career intelligence - authentication", () => {
  test("rejects unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/dashboard/career-intelligence");
    expect(res.status).toBe(401);
  });
});

describe("Career intelligence - ownership", () => {
  test("user only sees their own applications and data", async () => {
    const first = await registerUser();
    const second = await registerSecondUser();

    const job1 = await createJob();
    const job2 = await createJob({ title: "Second Role", companyName: "OtherCo" });

    const app1 = await createApplication(first.user.id as string, job1._id as Types.ObjectId, "applied");
    await createApplication(second.user.id as string, job2._id as Types.ObjectId, "offer");

    await CareerEmail.create({
      user: second.user.id,
      gmailMessageId: `msg-x${Math.random()}`,
      subject: "Secret offer for other user",
      from: "hiring@other.com",
      receivedAt: new Date(),
      category: "offer",
      application: app1._id as Types.ObjectId,
    });

    const res = await getDashboard(first.token);

    expect(res.status).toBe(200);
    expect(res.body.overview.totalApplications).toBe(1);
    expect(res.body.overview.applied).toBe(1);
    expect(res.body.overview.offer).toBe(0);

    const jobs = JSON.stringify(res.body);
    expect(jobs).not.toContain("Second Role");
    expect(jobs).not.toContain("Secret offer for other user");
  });

  test("no Gmail token or secret leakage in response", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "applied");
    await CareerEmail.create({
      user: user.id,
      gmailMessageId: `msg-y${Math.random()}`,
      subject: "Hello",
      from: "recruiter@acme.com",
      receivedAt: new Date(),
      category: "application_received",
      application: app._id as Types.ObjectId,
    });

    const res = await getDashboard(token);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/access_token|refresh_token|encryptedAccess|ya29|1\/\/refresh/i);
  });
});

describe("Career intelligence - overview", () => {
  test("returns correct status counts for mixed statuses", async () => {
    const { token, user } = await registerUser();
    const statuses = ["saved", "applied", "screening", "interview", "offer", "rejected", "withdrawn"];
    for (const status of statuses) {
      const job = await createJob({ title: `Role ${status}` });
      await createApplication(user.id as string, job._id as Types.ObjectId, status);
    }

    const res = await getDashboard(token);
    expect(res.status).toBe(200);
    expect(res.body.overview.totalApplications).toBe(7);
    expect(res.body.overview.saved).toBe(1);
    expect(res.body.overview.applied).toBe(1);
    expect(res.body.overview.screening).toBe(1);
    expect(res.body.overview.interview).toBe(1);
    expect(res.body.overview.offer).toBe(1);
    expect(res.body.overview.rejected).toBe(1);
    expect(res.body.overview.withdrawn).toBe(1);
  });

  test("returns zero-count states for a user with no applications", async () => {
    const { token } = await registerUser();
    const res = await getDashboard(token);
    expect(res.status).toBe(200);
    expect(res.body.overview.totalApplications).toBe(0);
    expect(res.body.overview.applied).toBe(0);
    expect(res.body.overview.interview).toBe(0);
    expect(res.body.overview.offer).toBe(0);
    expect(res.body.attention).toEqual([]);
    expect(res.body.upcomingInterviews).toEqual([]);
    expect(res.body.nextActions).toEqual([]);
  });
});

describe("Career intelligence - attention rules", () => {
  test("surfaces upcoming interview as high priority", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "interview");
    await CareerEmail.create({
      user: user.id,
      gmailMessageId: `msg-z${Math.random()}`,
      subject: "Interview Invitation",
      from: "recruiter@acme.com",
      receivedAt: new Date(),
      category: "interview_invitation",
      suggestedApplicationStatus: "interview",
      interview: {
        type: "technical",
        scheduledAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        interviewer: "Jane",
        meetingUrl: "https://meet.example.com/x",
        location: null,
      },
      application: app._id as Types.ObjectId,
    });

    const res = await getDashboard(token);
    expect(res.status).toBe(200);
    expect(res.body.upcomingInterviews.length).toBe(1);
    expect(res.body.upcomingInterviews[0].interview.scheduledAt).toBeTruthy();
    expect(res.body.upcomingInterviews[0].interview.interviewer).toBe("Jane");
    expect(res.body.upcomingInterviews[0].interview.meetingUrl).toBe("https://meet.example.com/x");

    const upcomingItem = res.body.attention.find(
      (item: { reason: string }) => /interview/i.test(item.reason)
    );
    expect(upcomingItem).toBeTruthy();
    expect(upcomingItem.priority).toBe("high");
  });

  test("a past interview does not appear as upcoming", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "interview");
    await CareerEmail.create({
      user: user.id,
      gmailMessageId: `msg-p${Math.random()}`,
      subject: "Past interview",
      receivedAt: new Date(),
      category: "interview_invitation",
      interview: {
        scheduledAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        interviewer: "Jane",
        meetingUrl: "https://meet.example.com/past",
        location: "Office",
      },
      application: app._id as Types.ObjectId,
    });

    const res = await getDashboard(token);
    expect(res.status).toBe(200);
    expect(res.body.upcomingInterviews).toEqual([]);
  });

  test("detects stale active application and suggests follow-up", async () => {
    process.env.APPLICATION_STALE_DAYS = "1";
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "applied", {
      updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });
    // Simulate an old event to ensure last activity is stale.
    await ApplicationEvent.create({
      user: user.id,
      application: app._id as Types.ObjectId,
      type: "status_changed",
      source: "system",
      title: "Status changed to applied",
      eventDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });

    const res = await getDashboard(token);
    const item = res.body.attention.find(
      (it: { reason: string }) => /no activity/i.test(it.reason)
    );
    expect(item).toBeTruthy();
    expect(res.body.nextActions.some((a: { action: string }) => /stale application/i.test(a.action))).toBe(true);
  });

  test("Gmail follow-up surfaces review action without changing status", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "applied");
    await CareerEmail.create({
      user: user.id,
      gmailMessageId: `msg-f${Math.random()}`,
      subject: "We'd like to move you forward",
      from: "recruiter@acme.com",
      receivedAt: new Date(),
      category: "application_update",
      suggestedApplicationStatus: "screening",
      application: app._id as Types.ObjectId,
    });

    const res = await getDashboard(token);
    const actionItem = res.body.nextActions.find(
      (it: { action?: string }) => /review email/i.test(it.action || "")
    );
    expect(actionItem).toBeTruthy();
    expect(actionItem.priority).toBe("medium");

    // Application status must be unchanged.
    const appInDb = await Application.findById(app._id);
    expect(appInDb!.status).toBe("applied");
  });

  test("offer is surfaced prominently", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    await createApplication(user.id as string, job._id as Types.ObjectId, "offer");

    const res = await getDashboard(token);
    const item = res.body.attention.find(
      (it: { reason: string }) => /offer/i.test(it.reason)
    );
    expect(item).toBeTruthy();
    expect(item.priority).toBe("high");
    expect(res.body.nextActions.some((a: { action: string }) => /offer/i.test(a.action))).toBe(true);
  });

  test("rejected and withdrawn applications are not surfaced as urgent actions", async () => {
    const { token, user } = await registerUser();
    const jobs = await Promise.all([createJob(), createJob({ title: "Role X" })]);
    await createApplication(user.id as string, jobs[0]._id as Types.ObjectId, "rejected");
    await createApplication(user.id as string, jobs[1]._id as Types.ObjectId, "withdrawn");

    const res = await getDashboard(token);
    expect(res.body.attention).toEqual([]);
    expect(res.body.nextActions).toEqual([]);
  });
});

describe("Career intelligence - recent activity", () => {
  test("orders recent activity by event date descending and bounds results", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "applied");

    // Older event.
    await ApplicationEvent.create({
      user: user.id,
      application: app._id as Types.ObjectId,
      type: "note",
      source: "user",
      title: "Old note",
      eventDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });
    // Newer event.
    await ApplicationEvent.create({
      user: user.id,
      application: app._id as Types.ObjectId,
      type: "recruiter_contact",
      source: "user",
      title: "Contacted recruiter",
      eventDate: new Date(),
    });

    const res = await getDashboard(token);
    const activity = res.body.recentActivity;
    expect(activity.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < activity.length; i++) {
      expect(new Date(activity[i - 1].date).getTime()).toBeGreaterThanOrEqual(
        new Date(activity[i].date).getTime()
      );
    }
  });

  test("uses explicit eventDate rather than createdAt for ordering", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "applied");

    // This event was created now but has an old eventDate.
    await ApplicationEvent.create({
      user: user.id,
      application: app._id as Types.ObjectId,
      type: "note",
      source: "user",
      title: "Backdated event",
      eventDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });

    const res = await getDashboard(token);
    const backdated = res.body.recentActivity.find(
      (a: { title: string }) => a.title === "Backdated event"
    );
    expect(backdated).toBeTruthy();
    // Ensure its date matches the explicit eventDate, not the created (now) time.
    const ageMs = Date.now() - new Date(backdated.date).getTime();
    expect(ageMs).toBeGreaterThan(1 * 24 * 60 * 60 * 1000);
  });
});

describe("Career intelligence - interviews", () => {
  test("handles nullable interviewer/URL/location", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "interview");
    await CareerEmail.create({
      user: user.id,
      gmailMessageId: `msg-n${Math.random()}`,
      subject: "Interview",
      receivedAt: new Date(),
      category: "interview_invitation",
      interview: {
        scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        interviewer: null,
        meetingUrl: null,
        location: "Onsite HQ",
      },
      application: app._id as Types.ObjectId,
    });

    const res = await getDashboard(token);
    expect(res.status).toBe(200);
    expect(res.body.upcomingInterviews.length).toBe(1);
    expect(res.body.upcomingInterviews[0].interview.interviewer).toBeNull();
    expect(res.body.upcomingInterviews[0].interview.meetingUrl).toBeNull();
    expect(res.body.upcomingInterviews[0].interview.location).toBe("Onsite HQ");
  });

  test("does not invent an interview date from email receivedAt", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "applied");
    await CareerEmail.create({
      user: user.id,
      gmailMessageId: `msg-recv${Math.random()}`,
      subject: "Some email",
      receivedAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      category: "follow_up",
      application: app._id as Types.ObjectId,
    });

    const res = await getDashboard(token);
    expect(res.body.upcomingInterviews).toEqual([]);
  });
});

describe("Career intelligence - recent status changes", () => {
  test("reconstructs previous and new status from status events", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "applied");
    await createStatusChangedEvent(user.id as string, String(app._id), "applied");
    await createStatusChangedEvent(user.id as string, String(app._id), "screening");

    const res = await getDashboard(token);
    expect(res.body.recentStatusChanges.length).toBe(2);
    const newest = res.body.recentStatusChanges[0];
    expect(newest.newStatus).toBe("screening");
    expect(newest.previousStatus).toBe("applied");
  });
});

describe("Career intelligence - edge cases", () => {
  test("user with applications but no emails", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    await createApplication(user.id as string, job._id as Types.ObjectId, "saved");

    const res = await getDashboard(token);
    expect(res.status).toBe(200);
    expect(res.body.overview.totalApplications).toBe(1);
    expect(res.body.recentCareerEmails).toEqual([]);
  });

  test("user with emails but no matched applications", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    await createApplication(user.id as string, job._id as Types.ObjectId, "applied");
    await CareerEmail.create({
      user: user.id,
      gmailMessageId: `msg-um${Math.random()}`,
      subject: "Unmatched",
      from: "hiring@co.com",
      receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      category: "recruiter_outreach",
    });

    const res = await getDashboard(token);
    expect(res.status).toBe(200);
    expect(res.body.recentCareerEmails.length).toBe(1);
    expect(res.body.recentCareerEmails[0].application).toBeNull();
  });

  test("application with no timeline does not error", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    await createApplication(user.id as string, job._id as Types.ObjectId, "applied");

    const res = await getDashboard(token);
    expect(res.status).toBe(200);
    expect(res.body.recentActivity.length).toBe(0);
  });

  test("application with no interview returns no upcoming interview", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    await createApplication(user.id as string, job._id as Types.ObjectId, "screening");

    const res = await getDashboard(token);
    expect(res.status).toBe(200);
    expect(res.body.upcomingInterviews).toEqual([]);
    expect(res.body.attention.length).toBe(0);
  });
});

describe("Career intelligence - preparation insights", () => {
  test("surfaces incomplete preparation for an interview-stage application", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "interview");

    await InterviewPreparation.create({
      user: user.id,
      application: app._id as Types.ObjectId,
      checklist: [
        { key: "resume_reviewed", label: "Resume reviewed", completed: true },
        { key: "company_researched", label: "Company researched", completed: false },
      ],
    });

    const res = await getDashboard(token);
    expect(res.status).toBe(200);
    expect(res.body.preparationInsights.length).toBe(1);
    const insight = res.body.preparationInsights[0];
    expect(insight.preparedCount).toBe(1);
    expect(insight.totalChecklistItems).toBe(2);
    expect(insight.priority).toBe("medium");
  });

  test("does not surface preparation for non-interview applications", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    await createApplication(user.id as string, job._id as Types.ObjectId, "applied");

    const res = await getDashboard(token);
    expect(res.status).toBe(200);
    expect(res.body.preparationInsights).toEqual([]);
  });

  test("does not surface preparation for rejected or withdrawn applications", async () => {
    const { token, user } = await registerUser();
    const jobs = await Promise.all([
      createJob(),
      createJob({ title: "Role X" }),
    ]);
    await createApplication(user.id as string, jobs[0]._id as Types.ObjectId, "rejected");
    await createApplication(user.id as string, jobs[1]._id as Types.ObjectId, "withdrawn");

    const res = await getDashboard(token);
    expect(res.body.preparationInsights).toEqual([]);
  });

  test("prep insight becomes low when the checklist is fully completed", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "interview");

    await InterviewPreparation.create({
      user: user.id,
      application: app._id as Types.ObjectId,
      checklist: [
        { key: "resume_reviewed", label: "Resume reviewed", completed: true },
        { key: "company_researched", label: "Company researched", completed: true },
      ],
    });

    const res = await getDashboard(token);
    const insight = res.body.preparationInsights[0];
    expect(insight.priority).toBe("low");
    expect(insight.preparedCount).toBe(2);
    expect(insight.totalChecklistItems).toBe(2);
  });

  test("prep insight is high priority for an upcoming interview with incomplete prep", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "interview");

    await CareerEmail.create({
      user: user.id,
      gmailMessageId: `msg-prep${Math.random()}`,
      subject: "Interview Invitation",
      from: "recruiter@acme.com",
      receivedAt: new Date(),
      category: "interview_invitation",
      interview: {
        type: "technical",
        scheduledAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        interviewer: "Jane",
        meetingUrl: "https://meet.example.com/prep",
        location: null,
      },
      application: app._id as Types.ObjectId,
    });

    await InterviewPreparation.create({
      user: user.id,
      application: app._id as Types.ObjectId,
      checklist: [
        { key: "resume_reviewed", label: "Resume reviewed", completed: true },
        { key: "company_researched", label: "Company researched", completed: false },
      ],
    });

    const res = await getDashboard(token);
    const insight = res.body.preparationInsights.find(
      (i: { reason: string }) => /upcoming interview/i.test(i.reason)
    );
    expect(insight).toBeTruthy();
    expect(insight.priority).toBe("high");
  });
});

describe("Career intelligence - follow-ups", () => {
  test("sorts an overdue follow-up to the top with overdue urgency", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "applied");

    await ApplicationFollowUp.create({
      user: user.id,
      application: app._id as Types.ObjectId,
      action: "recruiter_follow_up",
      dueAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      completed: false,
    });

    const res = await getDashboard(token);
    expect(res.status).toBe(200);
    expect(res.body.followUps).toHaveLength(1);
    expect(res.body.followUps[0].urgency).toBe("overdue");
    expect(res.body.followUps[0].application._id).toBe(String(app._id));
  });

  test("marks a follow-up due within today as due_today", async () => {
    // Pin the system clock to local noon so dueAt (= noon + 60 min) can never
    // cross a calendar-day boundary. Only Date is faked; real timers (setTimeout,
    // etc.) stay untouched so supertest/mongoose async operations work normally.
    const now = new Date();
    const fixedNow = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      12,
      0,
      0,
      0
    );
    // Fake Date (so the endpoint's `new Date()` is pinned) but keep all real
    // timer APIs so supertest/mongoose async work normally.
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
    jest.setSystemTime(fixedNow);

    try {
      const { token, user } = await registerUser();
      const job = await createJob();
      const app = await createApplication(user.id as string, job._id as Types.ObjectId, "applied");

      await ApplicationFollowUp.create({
        user: user.id,
        application: app._id as Types.ObjectId,
        action: "interview_follow_up",
        dueAt: new Date(Date.now() + 60 * 60 * 1000),
        completed: false,
      });

      const res = await getDashboard(token);
      expect(res.body.followUps[0].urgency).toBe("due_today");
    } finally {
      jest.useRealTimers();
    }
  });

  test("marks a future follow-up as upcoming", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "applied");

    await ApplicationFollowUp.create({
      user: user.id,
      application: app._id as Types.ObjectId,
      action: "custom",
      dueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      completed: false,
    });

    const res = await getDashboard(token);
    expect(res.body.followUps[0].urgency).toBe("upcoming");
  });

  test("marks completed follow-ups as completed and does not treat them as urgent", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "applied");

    await ApplicationFollowUp.create({
      user: user.id,
      application: app._id as Types.ObjectId,
      action: "thank_you_note",
      dueAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      completed: true,
      completedAt: new Date(),
    });

    const res = await getDashboard(token);
    expect(res.body.followUps[0].urgency).toBe("completed");
  });

  test("marks follow-ups for rejected or withdrawn applications as inactive", async () => {
    const { token, user } = await registerUser();
    const job = await createJob();
    const app = await createApplication(user.id as string, job._id as Types.ObjectId, "rejected");

    await ApplicationFollowUp.create({
      user: user.id,
      application: app._id as Types.ObjectId,
      action: "custom",
      dueAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      completed: false,
    });

    const res = await getDashboard(token);
    expect(res.body.followUps[0].urgency).toBe("inactive");
  });

  test("does not surface another user's follow-ups", async () => {
    const first = await registerUser();
    const second = await registerSecondUser();

    const job1 = await createJob();
    const app1 = await createApplication(first.user.id as string, job1._id as Types.ObjectId, "applied");

    await ApplicationFollowUp.create({
      user: first.user.id,
      application: app1._id as Types.ObjectId,
      action: "recruiter_follow_up",
      dueAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      completed: false,
    });

    const res = await getDashboard(second.token);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("recruiter_follow_up");
  });
});

describe("Career intelligence - follow-up deterministic ordering", () => {
  test("orders overdue high priority before overdue medium/low", async () => {
    const { token, user } = await registerUser();

    const overdueLow = await createApplication(
      user.id as string,
      (await createJob())._id as Types.ObjectId,
      "applied"
    );
    const overdueHigh = await createApplication(
      user.id as string,
      (await createJob())._id as Types.ObjectId,
      "applied"
    );

    await ApplicationFollowUp.create({
      user: user.id,
      application: overdueLow._id as Types.ObjectId,
      action: "custom",
      dueAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      priority: "low",
      completed: false,
    });
    await ApplicationFollowUp.create({
      user: user.id,
      application: overdueHigh._id as Types.ObjectId,
      action: "custom",
      dueAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      priority: "high",
      completed: false,
    });

    const res = await getDashboard(token);
    expect(res.status).toBe(200);
    expect(res.body.followUps[0].priority).toBe("high");
    expect(res.body.followUps[0].application._id).toBe(String(overdueHigh._id));
    expect(res.body.followUps[1].priority).toBe("low");
  });

  test("orders upcoming high priority before upcoming medium/low", async () => {
    const { token, user } = await registerUser();

    const upcomingLow = await createApplication(
      user.id as string,
      (await createJob())._id as Types.ObjectId,
      "applied"
    );
    const upcomingHigh = await createApplication(
      user.id as string,
      (await createJob())._id as Types.ObjectId,
      "applied"
    );

    await ApplicationFollowUp.create({
      user: user.id,
      application: upcomingLow._id as Types.ObjectId,
      action: "custom",
      dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      priority: "low",
      completed: false,
    });
    await ApplicationFollowUp.create({
      user: user.id,
      application: upcomingHigh._id as Types.ObjectId,
      action: "custom",
      dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      priority: "high",
      completed: false,
    });

    const res = await getDashboard(token);
    expect(res.body.followUps[0].priority).toBe("high");
    expect(res.body.followUps[0].application._id).toBe(String(upcomingHigh._id));
    expect(res.body.followUps[1].priority).toBe("low");
  });

  test("places overdue/due-today before upcoming and completed last", async () => {
    const { token, user } = await registerUser();

    const aOverdue = await createApplication(user.id as string, (await createJob())._id as Types.ObjectId, "applied");
    const aUpcoming = await createApplication(user.id as string, (await createJob())._id as Types.ObjectId, "applied");
    const aCompleted = await createApplication(user.id as string, (await createJob())._id as Types.ObjectId, "applied");

    await ApplicationFollowUp.create({
      user: user.id,
      application: aUpcoming._id as Types.ObjectId,
      action: "custom",
      dueAt: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
      priority: "high",
      completed: false,
    });
    await ApplicationFollowUp.create({
      user: user.id,
      application: aCompleted._id as Types.ObjectId,
      action: "custom",
      dueAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      priority: "high",
      completed: true,
      completedAt: new Date(),
    });
    await ApplicationFollowUp.create({
      user: user.id,
      application: aOverdue._id as Types.ObjectId,
      action: "custom",
      dueAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      priority: "medium",
      completed: false,
    });

    const res = await getDashboard(token);
    expect(res.body.followUps[0].application._id).toBe(String(aOverdue._id));
    expect(res.body.followUps[1].application._id).toBe(String(aUpcoming._id));
    expect(res.body.followUps[2].application._id).toBe(String(aCompleted._id));
    expect(res.body.followUps[0].urgency).toBe("overdue");
  });
});
