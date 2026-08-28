import { Types } from "mongoose";
import { Application, APPLICATION_STATUSES } from "../models/Application";
import { CareerEmail } from "../models/CareerEmail";
import ApplicationEvent from "../models/ApplicationEvent";

export interface DashboardOverview {
  totalApplications: number;
  saved: number;
  applied: number;
  screening: number;
  interview: number;
  offer: number;
  rejected: number;
  withdrawn: number;
}

export interface AttentionItem {
  application: Record<string, unknown>;
  reason: string;
  priority: "high" | "medium" | "low";
  eventDate?: string;
}

export interface UpcomingInterview {
  application: Record<string, unknown>;
  interview: {
    scheduledAt: string;
    interviewer?: string | null;
    meetingUrl?: string | null;
    location?: string | null;
  };
  eventDate: string;
}

export interface RecentStatusChange {
  application: Record<string, unknown>;
  event: Record<string, unknown>;
  previousStatus: string | null;
  newStatus: string;
}

export interface RecentCareerEmail {
  email: Record<string, unknown>;
  application: Record<string, unknown> | null;
}

export interface RecentActivityItem {
  id: string;
  kind: "event" | "email" | "status_change";
  date: string;
  title: string;
  description?: string;
  type?: string;
  source?: string;
  application?: Record<string, unknown> | null;
}

export interface NextAction {
  application: Record<string, unknown>;
  action: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

const JOB_POPULATE_FIELDS =
  "title companyName location locations remoteType employmentType source";

// Server-side bounds so the dashboard never loads unlimited documents.
const MAX_APPLICATIONS = 500;
const MAX_EMAILS = 25;
const MAX_ACTIVITY = 15;
const MAX_STATUS_EVENTS = 200;
const MAX_ATTENTION = 20;

const ACTIVE_STATUSES = new Set(["applied", "screening", "interview", "offer"]);

export interface CareerIntelligenceResult {
  overview: DashboardOverview;
  attention: AttentionItem[];
  upcomingInterviews: UpcomingInterview[];
  recentStatusChanges: RecentStatusChange[];
  recentCareerEmails: RecentCareerEmail[];
  recentActivity: RecentActivityItem[];
  nextActions: NextAction[];
  generatedAt: string;
}

type LeanApplication = {
  _id: Types.ObjectId;
  status: string;
  appliedAt?: Date;
  updatedAt: Date;
  job?: {
    _id?: Types.ObjectId;
    title?: string;
    companyName?: string;
    location?: string | null;
    locations?: string[];
    remoteType?: string;
    employmentType?: string;
    source?: string;
  } | null;
};

type LeanEmail = {
  _id: Types.ObjectId;
  subject?: string;
  from?: string;
  receivedAt?: Date;
  category?: string;
  confidence?: number;
  summary?: string;
  companyName?: string;
  jobTitle?: string;
  suggestedApplicationStatus?: string | null;
  interview?: {
    scheduledAt?: Date | null;
    interviewer?: string | null;
    meetingUrl?: string | null;
    location?: string | null;
    type?: string | null;
  } | null;
  application?: Types.ObjectId | null;
};

type LeanEvent = {
  _id: Types.ObjectId;
  application: Types.ObjectId;
  type: string;
  source: string;
  title: string;
  description?: string;
  eventDate: Date;
  createdAt: Date;
};

export async function buildCareerIntelligence(
  userId: string
): Promise<CareerIntelligenceResult> {
  const staleDays = getStaleDays();

  // Fetch all data needed in parallel.
  const [
    statusCounts,
    applications,
    emails,
    recentStatusEvents,
    recentActivityEvents,
  ] = await Promise.all([
    countByStatus(userId),
    loadApplications(userId),
    loadRecentEmails(userId),
    loadStatusEvents(userId),
    loadRecentEvents(userId),
  ]);

  const appById = new Map<string, LeanApplication>();
  for (const app of applications) {
    appById.set(String(app._id), app);
  }

  const emailByApp = new Map<string, LeanEmail[]>();
  for (const email of emails) {
    if (email.application) {
      const key = String(email.application);
      const list = emailByApp.get(key) ?? [];
      list.push(email);
      emailByApp.set(key, list);
    }
  }

  // Upcoming interviews: only explicit, stored future scheduledAt on emails.
  const upcomingInterviews = buildUpcomingInterviews(emails, appById);

  // Recent status changes with previous/new status reconstruction.
  const recentStatusChanges = buildRecentStatusChanges(
    recentStatusEvents,
    appById
  );

  // Deterministic attention + next actions derived from persisted data.
  const attentionInsights = buildAttentionInsights(
    appById,
    emailByApp,
    upcomingInterviews,
    recentActivityEvents,
    staleDays
  );

  const attention = attentionInsights
    .slice(0, MAX_ATTENTION)
    .map((insight) => toAttentionItem(insight));

  const nextActions = attentionInsights
    .filter((insight) => insight.action)
    .slice(0, MAX_ATTENTION)
    .map(toNextAction);

  const recentCareerEmails = emails.map((email) => ({
    email: toSafeEmail(email),
    application: email.application
      ? toSafeApplication(appById.get(String(email.application)) ?? null)
      : null,
  }));

  const recentActivity = buildRecentActivity(
    recentActivityEvents,
    recentStatusChanges,
    emails,
    appById
  );

  return {
    overview: buildOverview(statusCounts),
    attention,
    upcomingInterviews,
    recentStatusChanges,
    recentCareerEmails,
    recentActivity,
    nextActions,
    generatedAt: new Date().toISOString(),
  };
}

function getStaleDays(): number {
  const raw = Number(process.env.APPLICATION_STALE_DAYS);
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.floor(raw);
  }
  return 7;
}

function buildOverview(
  counts: { _id: string | null; count: number }[]
): DashboardOverview {
  const byStatus: Record<string, number> = {
    saved: 0,
    applied: 0,
    screening: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
    withdrawn: 0,
  };
  let total = 0;
  for (const entry of counts) {
    if (!entry._id) continue;
    const key = entry._id as keyof typeof byStatus;
    if (key in byStatus) {
      byStatus[key] = entry.count;
      total += entry.count;
    }
  }
  return {
    totalApplications: total,
    saved: byStatus.saved,
    applied: byStatus.applied,
    screening: byStatus.screening,
    interview: byStatus.interview,
    offer: byStatus.offer,
    rejected: byStatus.rejected,
    withdrawn: byStatus.withdrawn,
  };
}

async function countByStatus(
  userId: string
): Promise<{ _id: string | null; count: number }[]> {
  const result = await Application.aggregate([
    { $match: { user: new Types.ObjectId(userId) } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  return result as { _id: string | null; count: number }[];
}

async function loadApplications(
  userId: string
): Promise<LeanApplication[]> {
  return (await Application.find({ user: userId })
    .populate("job", JOB_POPULATE_FIELDS)
    .sort({ updatedAt: -1 })
    .limit(MAX_APPLICATIONS)
    .lean()) as unknown as LeanApplication[];
}

async function loadRecentEmails(userId: string): Promise<LeanEmail[]> {
  return (await CareerEmail.find({ user: userId })
    .sort({ receivedAt: -1 })
    .limit(MAX_EMAILS)
    .lean()) as unknown as LeanEmail[];
}

async function loadStatusEvents(userId: string): Promise<LeanEvent[]> {
  return (await ApplicationEvent.find({
    user: userId,
    type: "status_changed",
  })
    .sort({ eventDate: 1 })
    .limit(MAX_STATUS_EVENTS)
    .lean()) as unknown as LeanEvent[];
}

async function loadRecentEvents(userId: string): Promise<LeanEvent[]> {
  return (await ApplicationEvent.find({ user: userId })
    .sort({ eventDate: -1 })
    .limit(MAX_ACTIVITY)
    .lean()) as unknown as LeanEvent[];
}

type Insight = {
  application: LeanApplication;
  reason: string;
  priority: "high" | "medium" | "low";
  eventDate?: Date;
  action: string | null;
  actionExplanation: string;
};

function buildAttentionInsights(
  appById: Map<string, LeanApplication>,
  emailByApp: Map<string, LeanEmail[]>,
  upcomingInterviews: UpcomingInterview[],
  recentActivityEvents: LeanEvent[],
  staleDays: number
): Insight[] {
  const insights: Insight[] = [];
  const rejectedByApp = new Set<string>();

  const upcomingAppIds = new Set(
    upcomingInterviews.map((item) => String((item.application as { _id?: string })._id))
  );

  const lastActivityByApp = new Map<string, Date>();
  for (const event of recentActivityEvents) {
    const key = String(event.application);
    const existing = lastActivityByApp.get(key);
    if (!existing || event.eventDate > existing) {
      lastActivityByApp.set(key, event.eventDate);
    }
  }

  const staleCutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  for (const app of appById.values()) {
    const appId = String(app._id);
    const status = app.status;
    const emails = emailByApp.get(appId) ?? [];
    const lastActivity = lastActivityByApp.get(appId) ?? app.updatedAt;

    // Rejected / withdrawn: do not surface as urgent follow-up.
    if (status === "rejected" || status === "withdrawn") {
      rejectedByApp.add(appId);
      continue;
    }

    if (status === "offer") {
      insights.push({
        application: app,
        reason: "Offer received — review offer details.",
        priority: "high",
        eventDate: lastActivity,
        action: "Review offer",
        actionExplanation:
          "This application is in the offer stage.",
      });
      continue;
    }

    // Upcoming interview surfaced as high priority.
    if (upcomingAppIds.has(appId)) {
      const upcoming = upcomingInterviews.find(
        (item) => String((item.application as { _id?: string })._id) === appId
      );
      insights.push({
        application: app,
        reason: "Upcoming interview scheduled — prepare.",
        priority: "high",
        eventDate: upcoming
          ? new Date(upcoming.interview.scheduledAt)
          : undefined,
        action: "Review upcoming interview",
        actionExplanation: "An interview is explicitly scheduled for this application.",
      });
    } else if (status === "interview") {
      // Interview stage but no explicit future interview record: reminder.
      insights.push({
        application: app,
        reason: "Application is in interview stage — keep it moving.",
        priority: "medium",
        eventDate: lastActivity,
        action: "Review upcoming interview",
        actionExplanation:
          "The application is in the interview stage. Check for scheduled interview details.",
      });
    }

    // Gmail follow-up: matched email suggesting a status that differs from current.
    for (const email of emails) {
      const suggested = email.suggestedApplicationStatus;
      if (
        suggested &&
        suggested !== status &&
        email.category &&
        ["application_update", "follow_up", "offer", "interview_invitation", "assessment"].includes(
          email.category
        )
      ) {
        insights.push({
          application: app,
          reason: "Career email suggests an application status update.",
          priority: "medium",
          eventDate: email.receivedAt,
          action: "Review email / update application status",
          actionExplanation: `A matched ${email.category} email suggests status "${suggested}"; review it before changing anything.`,
        });
        break;
      }
    }

    // Stale active application.
    if (ACTIVE_STATUSES.has(status) && lastActivity.getTime() < staleCutoff.getTime()) {
      insights.push({
        application: app,
        reason: `No activity for over ${staleDays} days in an active application.`,
        priority: "medium",
        eventDate: lastActivity,
        action: "Follow up on stale application",
        actionExplanation: `No recent activity for ${staleDays}+ days while the application is still active.`,
      });
    }
  }

  void rejectedByApp;

  return insights;
}

function toAttentionItem(insight: Insight): AttentionItem {
  return {
    application: toSafeApplication(insight.application),
    reason: insight.reason,
    priority: insight.priority,
    eventDate: insight.eventDate ? insight.eventDate.toISOString() : undefined,
  };
}

function toNextAction(insight: Insight): NextAction {
  return {
    application: toSafeApplication(insight.application),
    action: insight.action ?? "",
    reason: insight.actionExplanation,
    priority: insight.priority,
  };
}

function buildUpcomingInterviews(
  emails: LeanEmail[],
  appById: Map<string, LeanApplication>
): UpcomingInterview[] {
  const now = new Date();
  const result: UpcomingInterview[] = [];
  const seen = new Set<string>();
  for (const email of emails) {
    if (!email.application) continue;
    const scheduledAt = email.interview?.scheduledAt;
    if (!scheduledAt || scheduledAt.getTime() <= now.getTime()) continue;
    const key = String(email.application);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      application: toSafeApplication(appById.get(key) ?? null),
      interview: {
        scheduledAt: scheduledAt.toISOString(),
        interviewer: email.interview?.interviewer ?? null,
        meetingUrl: email.interview?.meetingUrl ?? null,
        location: email.interview?.location ?? null,
      },
      eventDate: scheduledAt.toISOString(),
    });
  }
  result.sort(
    (a, b) =>
      new Date(a.interview.scheduledAt).getTime() -
      new Date(b.interview.scheduledAt).getTime()
  );
  return result;
}

function buildRecentStatusChanges(
  statusEvents: LeanEvent[],
  appById: Map<string, LeanApplication>
): RecentStatusChange[] {
  const byApp = new Map<string, LeanEvent[]>();
  for (const event of statusEvents) {
    const key = String(event.application);
    const list = byApp.get(key) ?? [];
    list.push(event);
    byApp.set(key, list);
  }

  const changes: RecentStatusChange[] = [];
  for (const [appId, events] of byApp) {
    if (events.length === 0) continue;
    const ordered = [...events].sort((a, b) => {
      const dateDiff = a.eventDate.getTime() - b.eventDate.getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const statuses = ordered.map((event) => parseStatusFromEvent(event));
    for (let i = 0; i < ordered.length; i++) {
      changes.push({
        application: toSafeApplication(appById.get(appId) ?? null),
        event: {
          id: String(ordered[i]._id),
          title: ordered[i].title,
          description: ordered[i].description,
          eventDate: ordered[i].eventDate.toISOString(),
          source: ordered[i].source,
        },
        previousStatus: i > 0 ? statuses[i - 1] : null,
        newStatus: statuses[i],
      });
    }
  }

  changes.sort((a, b) => {
    const da = new Date((a.event as { eventDate: string }).eventDate).getTime();
    const db = new Date((b.event as { eventDate: string }).eventDate).getTime();
    return db - da;
  });

  return changes.slice(0, MAX_ACTIVITY);
}

function parseStatusFromEvent(event: LeanEvent): string {
  const match = /status changed to (.+)/i.exec(event.title);
  if (match) return match[1].trim();
  if (event.description) {
    const matchDesc = /updated to (.+)/i.exec(event.description);
    if (matchDesc) return matchDesc[1].trim();
  }
  return "saved";
}

function buildRecentActivity(
  recentEvents: LeanEvent[],
  statusChanges: RecentStatusChange[],
  emails: LeanEmail[],
  appById: Map<string, LeanApplication>
): RecentActivityItem[] {
  const items: RecentActivityItem[] = [];

  for (const event of recentEvents) {
    items.push({
      id: String(event._id),
      kind: "event",
      date: event.eventDate.toISOString(),
      title: event.title,
      description: event.description,
      type: event.type,
      source: event.source,
      application: toSafeApplication(
        appById.get(String(event.application)) ?? null
      ),
    });
  }

  for (const change of statusChanges) {
    const event = change.event as { id: string; eventDate: string; title: string };
    items.push({
      id: `sc-${event.id}`,
      kind: "status_change",
      date: event.eventDate,
      title: event.title,
      type: "status_changed",
      source: "system",
      application: change.application,
    });
  }

  for (const email of emails) {
    items.push({
      id: String(email._id),
      kind: "email",
      date: email.receivedAt ? email.receivedAt.toISOString() : new Date(0).toISOString(),
      title: email.subject || "(no subject)",
      description: email.from,
      type: email.category,
      source: "gmail",
      application: email.application
        ? toSafeApplication(appById.get(String(email.application)) ?? null)
        : null,
    });
  }

  items.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return items.slice(0, MAX_ACTIVITY);
}

function toSafeEmail(email: LeanEmail): Record<string, unknown> {
  return {
    id: String(email._id),
    subject: email.subject,
    from: email.from,
    receivedAt: email.receivedAt ? email.receivedAt.toISOString() : null,
    category: email.category,
    confidence: email.confidence ?? null,
    summary: email.summary ?? null,
    companyName: email.companyName ?? null,
    jobTitle: email.jobTitle ?? null,
    suggestedApplicationStatus: email.suggestedApplicationStatus ?? null,
    interview: email.interview
      ? {
          scheduledAt: email.interview.scheduledAt
            ? email.interview.scheduledAt.toISOString()
            : null,
          interviewer: email.interview.interviewer ?? null,
          meetingUrl: email.interview.meetingUrl ?? null,
          location: email.interview.location ?? null,
          type: email.interview.type ?? null,
        }
      : null,
  };
}

function toSafeApplication(
  app: LeanApplication | null | undefined
): Record<string, unknown> {
  if (!app) return {};
  const job = app.job && typeof app.job === "object" ? app.job : null;
  return {
    _id: String(app._id),
    status: app.status,
    appliedAt: app.appliedAt ? app.appliedAt.toISOString() : null,
    updatedAt: app.updatedAt ? app.updatedAt.toISOString() : null,
    job: job
      ? {
          _id: job._id ? String(job._id) : undefined,
          title: job.title,
          companyName: job.companyName,
          location: job.location,
          locations: job.locations,
          remoteType: job.remoteType,
          employmentType: job.employmentType,
          source: job.source,
        }
      : null,
  };
}
