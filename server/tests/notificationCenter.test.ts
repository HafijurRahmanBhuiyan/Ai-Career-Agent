import request from "supertest";
import { Types } from "mongoose";
import { app } from "../src/app";
import { connectTestDB, disconnectTestDB, clearTestDB } from "./setup";
import { registerUser, registerSecondUser } from "./helpers";
import Profile from "../src/models/Profile";
import Skill from "../src/models/Skill";
import Experience from "../src/models/Experience";
import Job from "../src/models/Job";
import { Application } from "../src/models/Application";
import LinkedInDraft from "../src/models/LinkedInDraft";
import { CareerEmail } from "../src/models/CareerEmail";

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function seedStrongProfile(userId: string, seenDaysAgo: number) {
  await Profile.create({
    user: userId,
    fullName: "Test User",
    headline: "Full Stack Developer",
    summary: "Senior full stack developer with deep React and Node.js experience.",
    location: "Remote",
    preferredRoles: ["Full Stack Developer"],
    preferredLocations: ["Remote"],
    workPreference: "remote",
    salaryExpectation: { min: 90000, max: 150000, currency: "USD" },
    notificationsSeenAt: daysAgo(seenDaysAgo),
  });
  await Skill.create([
    { user: userId, name: "React", category: "Framework", proficiency: "Expert" },
    { user: userId, name: "Node.js", category: "Programming", proficiency: "Expert" },
    { user: userId, name: "TypeScript", category: "Programming", proficiency: "Advanced" },
    { user: userId, name: "Docker", category: "DevOps", proficiency: "Advanced" },
  ]);
  await Experience.create({
    user: userId,
    company: "Acme",
    position: "Full Stack Developer",
    description: "Building web apps with React and Node.js",
    startDate: daysAgo(365 * 6),
    currentlyWorking: true,
  });
}

const strongJob = (suffix: string, discoveredAt: Date) => ({
  source: "ingest",
  sourceJobId: `notif-${suffix}`,
  fingerprint: `fp-notif-${suffix}`,
  title: "Senior Full Stack Developer",
  companyName: "Acme Corp",
  description: "Senior full stack developer role with React and Node.js. Remote friendly.",
  locations: ["Remote"],
  location: "Remote",
  remoteType: "remote",
  employmentType: "full-time",
  experienceLevel: "senior",
  salaryMin: 100000,
  salaryMax: 160000,
  salaryCurrency: "USD",
  salaryPeriod: "yearly",
  skills: ["React", "Node.js", "TypeScript", "Docker"],
  technologies: ["React", "Node.js", "Docker", "Kubernetes"],
  jobUrl: `https://example.com/jobs/${suffix}`,
  applyUrl: `https://example.com/apply/${suffix}`,
  rawSource: {},
  lastSeenAt: discoveredAt,
  discoveredAt,
  isActive: true,
});

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

describe("Notification Center", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  it("aggregates high-match opportunities, drafts, handoffs, and emails since last seen", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;

    await seedStrongProfile(userId, 2);

    const newJob = await Job.create(strongJob("new", daysAgo(1)));
    await Job.create(strongJob("old", daysAgo(10)));

    const evidence = new Types.ObjectId();
    await LinkedInDraft.create({
      user: userId,
      evidence,
      hook: "Shipped a big platform this quarter",
      body: "Here is what we learned...",
      hashtags: ["react"],
      status: "reviewed",
    });

    const handoffJob = await Job.create(
      strongJob("handoff", daysAgo(1))
    );
    await Application.create({
      user: userId,
      job: handoffJob._id,
      status: "saved",
    });

    await CareerEmail.create({
      user: userId,
      gmailMessageId: "gm-1",
      threadId: "th-1",
      from: "recruiter@acme.com",
      subject: "Interview Invitation",
      snippet: "We would like to invite you to an interview.",
      receivedAt: daysAgo(1),
      category: "interview_invitation",
      companyName: "Acme",
      jobTitle: "Senior Engineer",
      classificationStatus: "classified",
    });

    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.since).toBeDefined();

    const promos = res.body.promos;
    expect(promos.linkedinDrafts).toHaveLength(1);
    expect(promos.linkedinDrafts[0].status).toBe("reviewed");
    expect(promos.unconfirmedHandoffs).toHaveLength(1);
    expect(promos.unconfirmedHandoffs[0].job.companyName).toBe("Acme Corp");
    expect(promos.careerEmails).toHaveLength(1);
    expect(promos.careerEmails[0].category).toBe("interview_invitation");

    // The new matching job must surface as a high match.
    const highMatches = promos.highMatchOpportunities as Array<{
      job: { sourceJobId: string };
      match: { score: number };
    }>;
    expect(highMatches.length).toBeGreaterThanOrEqual(1);
    expect(highMatches.some((h) => h.job.sourceJobId === `notif-new`)).toBe(true);
    // The older job surfaced BEFORE the seen timestamp must be excluded.
    expect(highMatches.some((h) => h.job.sourceJobId === `notif-old`)).toBe(false);

    // The handoff job is also a valid high match (it was discovered after the
    // seen timestamp), so total is the sum of all four section counts.
    const c = res.body.counts;
    expect(c.total).toBe(
      c.highMatchOpportunities +
        c.linkedinDrafts +
        c.unconfirmedHandoffs +
        c.careerEmails
    );
    expect(res.body.promos.highMatchOpportunities.length).toBeGreaterThan(0);
  });

  it("is scoped per user (another user sees no data)", async () => {
    const first = await registerUser();
    const second = await registerSecondUser();
    await seedStrongProfile((first.user as { id: string }).id, 2);
    await Job.create(strongJob("new", daysAgo(1)));

    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${second.token}`);

    expect(res.status).toBe(200);
    expect(res.body.promos.highMatchOpportunities).toHaveLength(0);
    expect(res.body.promos.linkedinDrafts).toHaveLength(0);
    expect(res.body.counts.total).toBe(0);
  });

  it("marks notifications as seen and updates notificationsSeenAt", async () => {
    const { token, user } = await registerUser();
    const userId = (user as { id: string }).id;
    await seedStrongProfile(userId, 5);

    const before = await Profile.findOne({ user: userId });
    expect(before!.notificationsSeenAt!.getTime()).toBeLessThan(Date.now());

    const res = await request(app)
      .post("/api/notifications/seen")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.notificationsSeenAt).toBeDefined();

    const after = await Profile.findOne({ user: userId });
    expect(after!.notificationsSeenAt!.getTime()).toBeGreaterThan(
      before!.notificationsSeenAt!.getTime()
    );
  });
});
