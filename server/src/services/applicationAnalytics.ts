import { Types } from "mongoose";
import { Application } from "../models/Application";
import type { ApplicationStatus } from "../models/Application";
import ApplicationEvent from "../models/ApplicationEvent";
import { ApplicationFollowUp } from "../models/ApplicationFollowUp";
import { InterviewPreparation } from "../models/InterviewPreparation";
import { CareerEmail } from "../models/CareerEmail";
import { buildPreparationSummary } from "./followUpClassification";
import type { AnalyticsRange } from "../validators/applicationAnalytics";
import { RANGE_DAYS } from "../validators/applicationAnalytics";

// Server-side bounds so analytics never load unlimited documents or return
// unbounded groupings. All limits are controlled here, never by the client.
const MAX_ANALYTICS_APPLICATIONS = 2000;
const MAX_ANALYTICS_EVENTS = 5000;
const MAX_ANALYTICS_FOLLOW_UPS = 2000;
const MAX_ANALYTICS_PREPARATIONS = 1000;
const MAX_ANALYTICS_EMAILS = 500;
export const MAX_COMPANIES = 10;
export const MAX_ATTENTION_ITEMS = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

// Analytics-specific active/completed grouping. An application is "active"
// while it is still progressing toward a decision, and "completed" once it
// has reached a terminal outcome (offer, rejected, or withdrawn).
const ACTIVE_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "applied",
  "screening",
  "interview",
]);
const COMPLETED_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "offer",
  "rejected",
  "withdrawn",
]);

// Ordering used to rank attention items by priority (deterministic).
const ATTENTION_PRIORITY_RANK: Record<AttentionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export interface TimeRangeMeta {
  value: AnalyticsRange;
  start: string | null;
  end: string;
  label: string;
}

export interface ApplicationFunnelStage {
  key: "applications" | "screening" | "interview" | "offer";
  label: string;
  count: number;
  percentage: number; // relative to totalApplications
  dropOff: number; // count difference from previous stage
}

export interface FunnelShape {
  stages: ApplicationFunnelStage[];
  rejections: number;
  withdrawals: number;
}

export interface ConversionMetrics {
  applicationToScreeningRate: number;
  screeningToInterviewRate: number;
  applicationToInterviewRate: number;
  interviewToOfferRate: number;
  applicationToOfferRate: number;
  rejectionRate: number;
}

export interface TimeToStageStats {
  sampleCount: number;
  averageDays: number | null;
  medianDays: number | null;
}

export interface TimeToStageMetrics {
  applicationToScreening: TimeToStageStats;
  screeningToInterview: TimeToStageStats;
  interviewToOffer: TimeToStageStats;
  applicationToOffer: TimeToStageStats;
  applicationToRejection: TimeToStageStats;
}

export interface TrendPoint {
  label: string;
  date: string;
  value: number;
}

export interface TrendMetric {
  points: TrendPoint[];
  totalInRange: number;
}

export interface TrendMetrics {
  applicationsCreated: TrendMetric;
  applicationsApplied: TrendMetric;
  interviews: TrendMetric;
  offers: TrendMetric;
  rejections: TrendMetric;
  withdrawals: TrendMetric;
  followUpsCreated: TrendMetric;
  followUpsCompleted: TrendMetric;
}

export interface FollowUpPerformance {
  total: number;
  open: number;
  completed: number;
  overdue: number;
  dueToday: number;
  highPriorityOpen: number;
  completionRate: number; // 0..1
  appsWithFollowUps: number;
  appsWithoutFollowUps: number;
  appsWithOverdueFollowUps: number;
}

export interface PreparationPerformance {
  appsWithPreparation: number;
  appsWithoutPreparation: number;
  averageCompletionPercent: number;
  fullyPrepared: number;
  partiallyPrepared: number;
  upcomingInterviewsWithIncompletePreparation: number;
}

export interface CompanyAnalytics {
  company: string;
  applications: number;
  interviews: number;
  offers: number;
  rejections: number;
  active: number;
}

export type AttentionPriority = "high" | "medium" | "low";

export type AttentionType =
  | "stale_active_application"
  | "overdue_high_priority_follow_up"
  | "upcoming_interview_incomplete_prep"
  | "interview_no_recent_activity"
  | "stuck_in_screening"
  | "stuck_in_interview";

export interface AttentionAnalyticsItem {
  type: AttentionType;
  priority: AttentionPriority;
  title: string;
  reason: string;
  application: SafeApplicationRef | null;
  relevantDate: string | null;
}

export interface SummaryMetrics {
  totalApplications: number;
  activeApplications: number;
  completedApplications: number;
  totalInterviews: number;
  upcomingInterviews: number;
  completedInterviews: number;
  totalOffers: number;
  totalRejections: number;
  totalWithdrawals: number;
  staleApplications: number;
}

export interface SafeApplicationRef {
  _id: string;
  status: ApplicationStatus;
  appliedAt: string | null;
  updatedAt: string | null;
  title: string | null;
  companyName: string | null;
}

export interface ApplicationAnalyticsResult {
  generatedAt: string;
  range: TimeRangeMeta;
  limit: number;
  summary: SummaryMetrics;
  applicationsByStatus: Record<ApplicationStatus, number>;
  conversionMetrics: ConversionMetrics;
  funnel: FunnelShape;
  timeToStage: TimeToStageMetrics;
  trends: TrendMetrics;
  followUps: FollowUpPerformance;
  preparation: PreparationPerformance;
  companies: CompanyAnalytics[];
  attentionItems: AttentionAnalyticsItem[];
}

export interface AnalyticsOptions {
  range: AnalyticsRange;
  limit?: number;
  now?: Date;
}

// ---------------------------------------------------------------------------
// Loader types
// ---------------------------------------------------------------------------

type LeanApplication = {
  _id: Types.ObjectId;
  status: ApplicationStatus;
  appliedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  job?: {
    title?: string;
    companyName?: string;
  } | null;
};

type LeanEvent = {
  _id: Types.ObjectId;
  application: Types.ObjectId;
  type: string;
  title: string;
  eventDate: Date;
};

type LeanFollowUp = {
  _id: Types.ObjectId;
  application: Types.ObjectId;
  priority: "low" | "medium" | "high";
  completed: boolean;
  dueAt: Date;
  completedAt?: Date | null;
};

type LeanPreparation = {
  _id: Types.ObjectId;
  application: Types.ObjectId;
  checklist?: Array<{ completed?: boolean }>;
};

type LeanEmail = {
  _id: Types.ObjectId;
  application?: Types.ObjectId | null;
  receivedAt?: Date;
  interview?: {
    scheduledAt?: Date | null;
  } | null;
};

type Stage =
  | "screening"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

// ---------------------------------------------------------------------------
// Time helpers (deterministic; tests can pass an explicit `now`)
// ---------------------------------------------------------------------------

export function getAnalyticsStaleDays(): number {
  const raw = Number(process.env.APPLICATION_STALE_DAYS);
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.floor(raw);
  }
  return 7;
}

function startOfDay(date: Date): Date {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Deterministic follow-up urgency computed against an explicit reference time
 * (rather than the global clock) so analytics are reproducible in tests.
 * Semantics match followUpClassification.classifyFollowUp: INACTIVE is checked
 * first so rejected/withdrawn applications are never surfaced as urgent.
 */
function classifyFollowUpAt(
  followUp: { completed: boolean; dueAt: Date },
  application: { status?: string } | null | undefined,
  now: Date
): FollowUpUrgencyValue {
  if (followUp.completed) return "completed";
  if (
    !application ||
    (application.status != null &&
      (application.status === "rejected" || application.status === "withdrawn"))
  ) {
    return "inactive";
  }
  const todayStart = startOfDay(now);
  const todayEnd = new Date(todayStart.getTime() + DAY_MS);
  const due = followUp.dueAt.getTime();
  if (due < now.getTime()) return "overdue";
  if (due >= todayStart.getTime() && due < todayEnd.getTime()) return "due_today";
  return "upcoming";
}

type FollowUpUrgencyValue =
  | "overdue"
  | "due_today"
  | "upcoming"
  | "completed"
  | "inactive";

export function rangeStart(range: AnalyticsRange, now: Date): Date | null {
  if (range === "all") return null;
  return new Date(now.getTime() - RANGE_DAYS[range] * DAY_MS);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function buildApplicationAnalytics(
  userId: string,
  options: AnalyticsOptions
): Promise<ApplicationAnalyticsResult> {
  const now = options.now ?? new Date();
  const staleDays = getAnalyticsStaleDays();
  const start = rangeStart(options.range, now);
  const limit = Math.min(Math.max(options.limit ?? MAX_ATTENTION_ITEMS, 1), MAX_ATTENTION_ITEMS);

  const [
    applications,
    events,
    followUps,
    preparations,
    emails,
  ] = await Promise.all([
    loadApplications(userId),
    loadEvents(userId),
    loadFollowUps(userId),
    loadPreparations(userId),
    loadEmails(userId),
  ]);

  const appById = new Map<string, LeanApplication>();
  for (const app of applications) {
    appById.set(String(app._id), app);
  }

  // Per-application, earliest date it reached each stage (from real events).
  const stageDatesByApp = buildStageDates(events);

  // --- Summary + by-status ---
  const statusCounts = countByStatus(applications);
  const summary = buildSummary(
    applications,
    appById,
    stageDatesByApp,
    emails,
    now,
    staleDays
  );

  // --- Conversion + funnel (current-status based, documented) ---
  const reached = computeReachedCounts(applications);
  const totalApplications = applications.length;
  const conversionMetrics = computeConversionMetrics(reached, totalApplications);
  const funnel = buildFunnel(reached, totalApplications);

  // --- Time-to-stage durations ---
  const timeToStage = computeTimeToStage(applications, stageDatesByApp);

  // --- Trends ---
  const bucketEnds = buildBucketEnds(options.range, now, applications, events, followUps);
  const trends = buildTrends(options.range, now, bucketEnds, applications, events, followUps);

  // --- Follow-up performance ---
  const followUpsResult = buildFollowUpPerformance(followUps, appById, now);

  // --- Preparation performance ---
  const preparation = buildPreparationPerformance(
    preparations,
    appById,
    emails,
    now
  );

  // --- Company analytics ---
  const companies = buildCompanyAnalytics(applications).slice(0, MAX_COMPANIES);

  // --- Attention items ---
  const attentionItems = buildAttentionItems(
    applications,
    appById,
    followUps,
    emails,
    now,
    staleDays
  ).slice(0, limit);

  return {
    generatedAt: now.toISOString(),
    range: {
      value: options.range,
      start: start ? start.toISOString() : null,
      end: now.toISOString(),
      label: options.range,
    },
    limit,
    summary,
    applicationsByStatus: statusCounts,
    conversionMetrics,
    funnel,
    timeToStage,
    trends,
    followUps: followUpsResult,
    preparation,
    companies,
    attentionItems,
  };
}

// ---------------------------------------------------------------------------
// Loading (bounded, user-scoped, parallel)
// ---------------------------------------------------------------------------

async function loadApplications(userId: string): Promise<LeanApplication[]> {
  return (await Application.find({ user: userId })
    .populate("job", "title companyName")
    .sort({ createdAt: 1 })
    .limit(MAX_ANALYTICS_APPLICATIONS)
    .lean()) as unknown as LeanApplication[];
}

async function loadEvents(userId: string): Promise<LeanEvent[]> {
  return (await ApplicationEvent.find({
    user: userId,
    type: {
      $in: [
        "status_changed",
        "interview_scheduled",
        "offer_received",
        "rejection_received",
        "application_created",
      ],
    },
  })
    .sort({ eventDate: 1 })
    .limit(MAX_ANALYTICS_EVENTS)
    .lean()) as unknown as LeanEvent[];
}

async function loadFollowUps(userId: string): Promise<LeanFollowUp[]> {
  return (await ApplicationFollowUp.find({ user: userId })
    .sort({ dueAt: 1 })
    .limit(MAX_ANALYTICS_FOLLOW_UPS)
    .lean()) as unknown as LeanFollowUp[];
}

async function loadPreparations(userId: string): Promise<LeanPreparation[]> {
  return (await InterviewPreparation.find({ user: userId })
    .sort({ updatedAt: 1 })
    .limit(MAX_ANALYTICS_PREPARATIONS)
    .lean()) as unknown as LeanPreparation[];
}

async function loadEmails(userId: string): Promise<LeanEmail[]> {
  return (await CareerEmail.find({ user: userId })
    .sort({ receivedAt: 1 })
    .limit(MAX_ANALYTICS_EMAILS)
    .lean()) as unknown as LeanEmail[];
}

// ---------------------------------------------------------------------------
// Summary + by-status
// ---------------------------------------------------------------------------

function countByStatus(
  applications: LeanApplication[]
): Record<ApplicationStatus, number> {
  const counts: Record<ApplicationStatus, number> = {
    saved: 0,
    applied: 0,
    screening: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
    withdrawn: 0,
  };
  for (const app of applications) {
    if (app.status in counts) {
      counts[app.status]++;
    }
  }
  return counts;
}

function buildSummary(
  applications: LeanApplication[],
  appById: Map<string, LeanApplication>,
  stageDatesByApp: Map<string, Map<Stage, Date>>,
  emails: LeanEmail[],
  now: Date,
  staleDays: number
): SummaryMetrics {
  let active = 0;
  let completed = 0;
  let totalInterviews = 0;
  let completedInterviews = 0;
  let totalOffers = 0;
  let totalRejections = 0;
  let totalWithdrawals = 0;
  let stale = 0;

  const staleCutoff = new Date(now.getTime() - staleDays * DAY_MS);

  for (const app of applications) {
    if (ACTIVE_STATUSES.has(app.status)) active++;
    if (COMPLETED_STATUSES.has(app.status)) completed++;
    if (app.status === "offer") totalOffers++;
    if (app.status === "rejected") totalRejections++;
    if (app.status === "withdrawn") totalWithdrawals++;

    const stages = stageDatesByApp.get(String(app._id));
    if (stages?.has("interview")) totalInterviews++;

    const lastActivity = app.updatedAt;
    if (
      ACTIVE_STATUSES.has(app.status) &&
      lastActivity.getTime() < staleCutoff.getTime()
    ) {
      stale++;
    }
  }

  // Completed interviews: applications that reached interview and are no
  // longer upcoming (not currently at interview / offer with an upcoming
  // interview). Since we only track reached-interview apps, count those whose
  // current status moved past interview (offer/rejected) or that reached
  // interview but have no upcoming scheduled interview.
  const upcomingAppIds = buildUpcomingAppIds(emails, now, appById);
  for (const app of applications) {
    const stages = stageDatesByApp.get(String(app._id));
    if (!stages?.has("interview")) continue;
    if (app.status !== "interview" || !upcomingAppIds.has(String(app._id))) {
      completedInterviews++;
    }
  }

  return {
    totalApplications: applications.length,
    activeApplications: active,
    completedApplications: completed,
    totalInterviews,
    upcomingInterviews: upcomingAppIds.size,
    completedInterviews,
    totalOffers,
    totalRejections,
    totalWithdrawals,
    staleApplications: stale,
  };
}

// ---------------------------------------------------------------------------
// Conversion + funnel
// ---------------------------------------------------------------------------

interface ReachedCounts {
  reachedScreening: number;
  reachedInterview: number;
  reachedOffer: number;
  rejected: number;
  withdrawn: number;
}

function computeReachedCounts(
  applications: LeanApplication[]
): ReachedCounts {
  let reachedScreening = 0;
  let reachedInterview = 0;
  let reachedOffer = 0;
  let rejected = 0;
  let withdrawn = 0;

  for (const app of applications) {
    const s = app.status;
    if (s === "screening" || s === "interview" || s === "offer")
      reachedScreening++;
    if (s === "interview" || s === "offer") reachedInterview++;
    if (s === "offer") reachedOffer++;
    if (s === "rejected") rejected++;
    if (s === "withdrawn") withdrawn++;
  }

  return {
    reachedScreening,
    reachedInterview,
    reachedOffer,
    rejected,
    withdrawn,
  };
}

function pct(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return 0;
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function computeConversionMetrics(
  reached: ReachedCounts,
  totalApplications: number
): ConversionMetrics {
  return {
    applicationToScreeningRate: pct(
      reached.reachedScreening,
      totalApplications
    ),
    screeningToInterviewRate: pct(
      reached.reachedInterview,
      reached.reachedScreening
    ),
    applicationToInterviewRate: pct(
      reached.reachedInterview,
      totalApplications
    ),
    interviewToOfferRate: pct(reached.reachedOffer, reached.reachedInterview),
    applicationToOfferRate: pct(reached.reachedOffer, totalApplications),
    rejectionRate: pct(reached.rejected, totalApplications),
  };
}

function buildFunnel(
  reached: ReachedCounts,
  totalApplications: number
): FunnelShape {
  const stages: ApplicationFunnelStage[] = [
    {
      key: "applications",
      label: "Applications",
      count: totalApplications,
      percentage: pct(totalApplications, totalApplications),
      dropOff: 0,
    },
    {
      key: "screening",
      label: "Screening",
      count: reached.reachedScreening,
      percentage: pct(reached.reachedScreening, totalApplications),
      dropOff: totalApplications - reached.reachedScreening,
    },
    {
      key: "interview",
      label: "Interviews",
      count: reached.reachedInterview,
      percentage: pct(reached.reachedInterview, totalApplications),
      dropOff: reached.reachedScreening - reached.reachedInterview,
    },
    {
      key: "offer",
      label: "Offers",
      count: reached.reachedOffer,
      percentage: pct(reached.reachedOffer, totalApplications),
      dropOff: reached.reachedInterview - reached.reachedOffer,
    },
  ];
  return {
    stages,
    rejections: reached.rejected,
    withdrawals: reached.withdrawn,
  };
}

// ---------------------------------------------------------------------------
// Time-to-stage durations (real event dates only; null when insufficient)
// ---------------------------------------------------------------------------

function toDays(ms: number): number {
  return ms / DAY_MS;
}

function computeTimeToStage(
  applications: LeanApplication[],
  stageDatesByApp: Map<string, Map<Stage, Date>>
): TimeToStageMetrics {
  const samples: Record<"applicationToScreening" | "screeningToInterview" | "interviewToOffer" | "applicationToOffer" | "applicationToRejection", number[]> = {
    applicationToScreening: [],
    screeningToInterview: [],
    interviewToOffer: [],
    applicationToOffer: [],
    applicationToRejection: [],
  };

  for (const app of applications) {
    const appDate = app.appliedAt ?? app.createdAt;
    if (!appDate) continue;
    const stages = stageDatesByApp.get(String(app._id));
    if (!stages) continue;

    const screening = stages.get("screening");
    const interview = stages.get("interview");
    const offer = stages.get("offer");
    const rejected = stages.get("rejected");

    if (screening && screening.getTime() >= appDate.getTime()) {
      samples.applicationToScreening.push(screening.getTime() - appDate.getTime());
    }
    if (screening && interview && interview.getTime() >= screening.getTime()) {
      samples.screeningToInterview.push(interview.getTime() - screening.getTime());
    }
    if (interview && offer && offer.getTime() >= interview.getTime()) {
      samples.interviewToOffer.push(offer.getTime() - interview.getTime());
    }
    if (offer && offer.getTime() >= appDate.getTime()) {
      samples.applicationToOffer.push(offer.getTime() - appDate.getTime());
    }
    if (rejected && rejected.getTime() >= appDate.getTime()) {
      samples.applicationToRejection.push(
        rejected.getTime() - appDate.getTime()
      );
    }
  }

  return {
    applicationToScreening: summarizeDurations(samples.applicationToScreening),
    screeningToInterview: summarizeDurations(samples.screeningToInterview),
    interviewToOffer: summarizeDurations(samples.interviewToOffer),
    applicationToOffer: summarizeDurations(samples.applicationToOffer),
    applicationToRejection: summarizeDurations(samples.applicationToRejection),
  };
}

function summarizeDurations(durationsMs: number[]): TimeToStageStats {
  if (durationsMs.length === 0) {
    return { sampleCount: 0, averageDays: null, medianDays: null };
  }
  const days = durationsMs
    .map((ms) => toDays(ms))
    .sort((a, b) => a - b);
  const sum = days.reduce((acc, d) => acc + d, 0);
  const avg = sum / days.length;
  const mid = Math.floor(days.length / 2);
  const median =
    days.length % 2 === 0
      ? (days[mid - 1] + days[mid]) / 2
      : days[mid];
  return {
    sampleCount: days.length,
    averageDays: Math.round(avg * 100) / 100,
    medianDays: Math.round(median * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Stage-discovering helpers (from real ApplicationEvents)
// ---------------------------------------------------------------------------

function parseStatusFromEventTitle(event: LeanEvent): string | null {
  const match = /status changed to (.+)/i.exec(event.title);
  if (match) return match[1].trim();
  if (event.title) {
    const matchUpdated = /updated to (.+)/i.exec(event.title);
    if (matchUpdated) return matchUpdated[1].trim();
  }
  return null;
}

function eventReachesStage(event: LeanEvent): Stage | null {
  switch (event.type) {
    case "interview_scheduled":
      return "interview";
    case "offer_received":
      return "offer";
    case "rejection_received":
      return "rejected";
    case "status_changed": {
      const status = parseStatusFromEventTitle(event);
      if (
        status === "screening" ||
        status === "interview" ||
        status === "offer" ||
        status === "rejected" ||
        status === "withdrawn"
      ) {
        return status;
      }
      return null;
    }
    default:
      return null;
  }
}

function buildStageDates(
  events: LeanEvent[]
): Map<string, Map<Stage, Date>> {
  const byApp = new Map<string, Map<Stage, Date>>();
  for (const event of events) {
    const stage = eventReachesStage(event);
    if (!stage) continue;
    const appId = String(event.application);
    let map = byApp.get(appId);
    if (!map) {
      map = new Map();
      byApp.set(appId, map);
    }
    const existing = map.get(stage);
    if (!existing || event.eventDate.getTime() < existing.getTime()) {
      map.set(stage, event.eventDate);
    }
  }
  return byApp;
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

interface Bucket {
  start: Date;
  end: Date;
  label: string;
}

function buildBucketEnds(
  range: AnalyticsRange,
  now: Date,
  applications: LeanApplication[],
  events: LeanEvent[],
  followUps: LeanFollowUp[]
): Date[] {
  if (range !== "all") {
    const start = rangeStart(range, now)!;
    return [start, now];
  }
  // "all": bucket from the earliest data point to now.
  let earliest = now.getTime();
  for (const app of applications) {
    const d = (app.appliedAt ?? app.createdAt).getTime();
    if (d < earliest) earliest = d;
  }
  for (const event of events) {
    if (event.eventDate.getTime() < earliest) earliest = event.eventDate.getTime();
  }
  for (const followUp of followUps) {
    if (followUp.dueAt.getTime() < earliest) earliest = followUp.dueAt.getTime();
  }
  return [new Date(earliest), now];
}

function buildBuckets(start: Date, end: Date, count: number): Bucket[] {
  const countSafe = Math.max(1, Math.min(count, 30));
  const span = end.getTime() - start.getTime();
  const window = Math.floor(span / countSafe);
  const buckets: Bucket[] = [];
  for (let i = 0; i < countSafe; i++) {
    const bStart = new Date(start.getTime() + i * window);
    const bEnd = new Date(start.getTime() + (i + 1) * window);
    buckets.push({
      start: bStart,
      end: i === countSafe - 1 ? end : bEnd,
      label: bStart.toISOString().slice(0, 10),
    });
  }
  return buckets;
}

function bucketCountForRange(range: AnalyticsRange): number {
  switch (range) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 12;
    case "180d":
      return 12;
    case "365d":
      return 12;
    case "all":
      return 12;
  }
}

function buildTrends(
  range: AnalyticsRange,
  now: Date,
  bucketEnds: Date[],
  applications: LeanApplication[],
  events: LeanEvent[],
  followUps: LeanFollowUp[]
): TrendMetrics {
  const [start, end] = bucketEnds;
  const buckets = buildBuckets(start, end, bucketCountForRange(range));

  const countInBuckets = (dates: number[]): number[] => {
    const counts = buckets.map(() => 0);
    for (const t of dates) {
      for (let i = 0; i < buckets.length; i++) {
        if (t >= buckets[i].start.getTime() && t < buckets[i].end.getTime()) {
          counts[i]++;
          break;
        }
      }
    }
    return counts;
  };

  // applications created / applied (from Application records)
  const appCreated = applications.map((a) => a.createdAt.getTime());
  const appApplied = applications
    .map((a) => a.appliedAt?.getTime())
    .filter((t): t is number => typeof t === "number");

  // stage-reach dates (first time reaching each stage, earliest per app)
  const stageDates = buildStageDates(events);
  const interviews: number[] = [];
  const offers: number[] = [];
  const rejections: number[] = [];
  const withdrawals: number[] = [];
  for (const map of stageDates.values()) {
    const iv = map.get("interview");
    if (iv) interviews.push(iv.getTime());
    const of = map.get("offer");
    if (of) offers.push(of.getTime());
    const rj = map.get("rejected");
    if (rj) rejections.push(rj.getTime());
    const wd = map.get("withdrawn");
    if (wd) withdrawals.push(wd.getTime());
  }

  const followUpCreated = followUps.map((f) => f.dueAt.getTime());
  const followUpCompleted = followUps
    .filter((f) => f.completed && f.completedAt)
    .map((f) => f.completedAt!.getTime());

  const pointize = (counts: number[]): TrendPoint[] =>
    buckets.map((b, i) => ({
      label: b.label,
      date: b.start.toISOString(),
      value: counts[i],
    }));

  const countsFor = (dates: number[]): TrendMetric => {
    const counts = countInBuckets(dates);
    return {
      points: pointize(counts),
      totalInRange: dates.filter(
        (t) => t >= start.getTime() && t <= end.getTime()
      ).length,
    };
  };

  return {
    applicationsCreated: countsFor(appCreated),
    applicationsApplied: countsFor(appApplied),
    interviews: countsFor(interviews),
    offers: countsFor(offers),
    rejections: countsFor(rejections),
    withdrawals: countsFor(withdrawals),
    followUpsCreated: countsFor(followUpCreated),
    followUpsCompleted: countsFor(followUpCompleted),
  };
}

// ---------------------------------------------------------------------------
// Follow-up performance
// ---------------------------------------------------------------------------

function buildFollowUpPerformance(
  followUps: LeanFollowUp[],
  appById: Map<string, LeanApplication>,
  now: Date
): FollowUpPerformance {
  let open = 0;
  let completed = 0;
  let overdue = 0;
  let dueToday = 0;
  let highPriorityOpen = 0;

  const todayStart = startOfDay(now);

  const appsWithFollowUps = new Set<string>();
  const appsWithOverdue = new Set<string>();

  for (const followUp of followUps) {
    const appId = String(followUp.application);
    appsWithFollowUps.add(appId);

    if (followUp.completed) {
      completed++;
      continue;
    }
    open++;

    const app = appById.get(appId);
    const urgency = classifyFollowUpAt(followUp, app, now);

    if (followUp.priority === "high") highPriorityOpen++;

    if (urgency === "overdue") {
      overdue++;
      appsWithOverdue.add(appId);
    } else if (urgency === "due_today") {
      dueToday++;
    }
  }

  return {
    total: followUps.length,
    open,
    completed,
    overdue,
    dueToday,
    highPriorityOpen,
    completionRate: pct(completed, followUps.length),
    appsWithFollowUps: appsWithFollowUps.size,
    appsWithoutFollowUps: Math.max(
      0,
      appById.size - appsWithFollowUps.size
    ),
    appsWithOverdueFollowUps: appsWithOverdue.size,
  };
}

// ---------------------------------------------------------------------------
// Interview preparation performance
// ---------------------------------------------------------------------------

function buildPreparationPerformance(
  preparations: LeanPreparation[],
  appById: Map<string, LeanApplication>,
  emails: LeanEmail[],
  now: Date
): PreparationPerformance {
  const prepByApp = new Map<string, LeanPreparation>();
  for (const prep of preparations) {
    prepByApp.set(String(prep.application), prep);
  }

  let appsWithPreparation = 0;
  let fullyPrepared = 0;
  let partiallyPrepared = 0;
  const completionPercents: number[] = [];

  for (const app of appById.values()) {
    const prep = prepByApp.get(String(app._id));
    if (!prep) continue;
    appsWithPreparation++;
    const summary = buildPreparationSummary(prep);
    completionPercents.push(summary.completionPercent);
    if (summary.totalChecklistItems > 0 && summary.completionPercent === 100) {
      fullyPrepared++;
    } else if (summary.totalChecklistItems > 0) {
      partiallyPrepared++;
    }
  }

  const avgCompletion =
    completionPercents.length === 0
      ? 0
      : Math.round(
          completionPercents.reduce((a, b) => a + b, 0) /
            completionPercents.length
        );

  // Upcoming interviews with incomplete preparation.
  const upcomingAppIds = buildUpcomingAppIds(emails, now, appById);
  let upcomingIncompletePrep = 0;
  for (const appId of upcomingAppIds) {
    const prep = prepByApp.get(appId);
    const summary = buildPreparationSummary(prep);
    const isComplete =
      summary.totalChecklistItems > 0 && summary.completionPercent === 100;
    if (!isComplete) {
      upcomingIncompletePrep++;
    }
  }

  const appsWithoutPreparation = Math.max(
    0,
    appById.size - appsWithPreparation
  );

  return {
    appsWithPreparation,
    appsWithoutPreparation,
    averageCompletionPercent: avgCompletion,
    fullyPrepared,
    partiallyPrepared,
    upcomingInterviewsWithIncompletePreparation: upcomingIncompletePrep,
  };
}

function buildUpcomingAppIds(
  emails: LeanEmail[],
  now: Date,
  appById: Map<string, LeanApplication>
): Set<string> {
  const result = new Set<string>();
  for (const email of emails) {
    const scheduledAt = email.interview?.scheduledAt;
    if (!scheduledAt) continue;
    if (scheduledAt.getTime() <= now.getTime()) continue;
    const appId = email.application ? String(email.application) : null;
    if (!appId || !appById.has(appId)) continue;
    result.add(appId);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Company analytics
// ---------------------------------------------------------------------------

function buildCompanyAnalytics(
  applications: LeanApplication[]
): CompanyAnalytics[] {
  const map = new Map<string, CompanyAnalytics>();
  for (const app of applications) {
    const company =
      typeof app.job === "object" && app.job?.companyName
        ? app.job.companyName
        : "Unknown";
    let entry = map.get(company);
    if (!entry) {
      entry = {
        company,
        applications: 0,
        interviews: 0,
        offers: 0,
        rejections: 0,
        active: 0,
      };
      map.set(company, entry);
    }
    entry.applications++;
    if (app.status === "interview" || app.status === "offer") entry.interviews++;
    if (app.status === "offer") entry.offers++;
    if (app.status === "rejected") entry.rejections++;
    if (ACTIVE_STATUSES.has(app.status)) entry.active++;
  }
  const entries = Array.from(map.values());
  entries.sort((a, b) => {
    if (b.applications !== a.applications) {
      return b.applications - a.applications;
    }
    return a.company.localeCompare(b.company);
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Deterministic attention insights (analytics-based, never AI-generated)
// ---------------------------------------------------------------------------

function buildAttentionItems(
  applications: LeanApplication[],
  appById: Map<string, LeanApplication>,
  followUps: LeanFollowUp[],
  emails: LeanEmail[],
  now: Date,
  staleDays: number
): AttentionAnalyticsItem[] {
  const items: AttentionAnalyticsItem[] = [];
  const staleCutoff = new Date(now.getTime() - staleDays * DAY_MS);
  const upcomingAppIds = buildUpcomingAppIds(emails, now, appById);

  for (const app of applications) {
    const appId = String(app._id);
    const safe = toSafeAppRef(app);
    const lastActivity = app.updatedAt;

    // Stale active application.
    if (
      ACTIVE_STATUSES.has(app.status) &&
      lastActivity.getTime() < staleCutoff.getTime()
    ) {
      items.push({
        type: "stale_active_application",
        priority: "medium",
        title: "Stale active application",
        reason: `No activity in this active application for over ${staleDays} days.`,
        application: safe,
        relevantDate: lastActivity.toISOString(),
      });
    }

    // Upcoming interview with incomplete preparation.
    if (upcomingAppIds.has(appId)) {
      items.push({
        type: "upcoming_interview_incomplete_prep",
        priority: "high",
        title: "Upcoming interview needs preparation",
        reason:
          "An interview is scheduled but the preparation checklist is not complete.",
        application: safe,
        relevantDate: null,
      });
    } else if (
      app.status === "interview" &&
      lastActivity.getTime() < staleCutoff.getTime()
    ) {
      // Interview stage, no upcoming scheduled interview, no recent activity.
      items.push({
        type: "interview_no_recent_activity",
        priority: "medium",
        title: "Interview stage with no recent activity",
        reason:
          "Application is in the interview stage but has had no activity for a while.",
        application: safe,
        relevantDate: lastActivity.toISOString(),
      });
    }

    if (app.status === "screening") {
      items.push({
        type: "stuck_in_screening",
        priority: "low",
        title: "Application stuck in screening",
        reason:
          "The application has remained in the screening stage without moving forward.",
        application: safe,
        relevantDate: lastActivity.toISOString(),
      });
    } else if (app.status === "interview") {
      items.push({
        type: "stuck_in_interview",
        priority: "low",
        title: "Application stuck in interview stage",
        reason:
          "The application has remained in the interview stage without a resolution.",
        application: safe,
        relevantDate: lastActivity.toISOString(),
      });
    }
  }

  // Overdue high-priority open follow-ups, one item per affected application.
  const overdueAppIds = new Set<string>();
  for (const followUp of followUps) {
    if (followUp.completed || followUp.priority !== "high") continue;
    const appId = String(followUp.application);
    if (overdueAppIds.has(appId)) continue;
    const app = appById.get(appId);
    const urgency = classifyFollowUpAt(followUp, app, now);
    if (urgency !== "overdue") continue;
    overdueAppIds.add(appId);
    items.push({
      type: "overdue_high_priority_follow_up",
      priority: "high",
      title: "Overdue high-priority follow-up",
      reason:
        "A high-priority follow-up on this application is now overdue.",
      application: app ? toSafeAppRef(app) : null,
      relevantDate: followUp.dueAt.toISOString(),
    });
  }

  return sortAttentionItems(items);
}

function sortAttentionItems(
  items: AttentionAnalyticsItem[]
): AttentionAnalyticsItem[] {
  return items.sort((a, b) => {
    const rankDiff =
      ATTENTION_PRIORITY_RANK[a.priority] - ATTENTION_PRIORITY_RANK[b.priority];
    if (rankDiff !== 0) return rankDiff;
    const da = a.relevantDate ? a.relevantDate : "";
    const db = b.relevantDate ? b.relevantDate : "";
    if (da !== db) return da.localeCompare(db);
    const aId = a.application?._id ?? "";
    const bId = b.application?._id ?? "";
    return aId.localeCompare(bId);
  });
}

function toSafeAppRef(app: LeanApplication): SafeApplicationRef {
  return {
    _id: String(app._id),
    status: app.status,
    appliedAt: app.appliedAt ? app.appliedAt.toISOString() : null,
    updatedAt: app.updatedAt ? app.updatedAt.toISOString() : null,
    title: typeof app.job === "object" ? app.job?.title ?? null : null,
    companyName:
      typeof app.job === "object" ? app.job?.companyName ?? null : null,
  };
}
