import { createHash } from "crypto";
import { Types } from "mongoose";
import { Application } from "../models/Application";
import { ApplicationEvent } from "../models/ApplicationEvent";
import { ApplicationSummary, IApplicationSummary } from "../models/ApplicationSummary";
import { CareerEmail } from "../models/CareerEmail";
import Job from "../models/Job";
import JobMatch from "../models/JobMatch";
import Profile from "../models/Profile";
import { ClaudeService } from "../integrations/claude/claude.service";
import { getModel } from "../integrations/claude/claudeClient";
import { APPLICATION_SUMMARY_PROMPT_VERSION } from "../integrations/claude/applicationSummaryPrompts";
import { ApplicationSummaryInput } from "../integrations/claude/applicationSummaryPrompts";
import { validateApplicationSummaryAIOutput } from "../validators/applicationSummary";
import { AppError } from "../middleware/errorHandler";

const claudeService = new ClaudeService();

export const APPLICATION_SUMMARY_CACHE_HOURS_DEFAULT = 24 * 7;

export function getApplicationSummaryCacheHours(): number {
  const parsed = parseInt(
    process.env.APPLICATION_SUMMARY_CACHE_HOURS ||
      `${APPLICATION_SUMMARY_CACHE_HOURS_DEFAULT}`,
    10
  );
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : APPLICATION_SUMMARY_CACHE_HOURS_DEFAULT;
}

const ensureApplicationOwned = async (
  userId: string,
  applicationId: string
) => {
  if (!Types.ObjectId.isValid(applicationId)) {
    throw new AppError("Application not found", 404);
  }
  const app = await Application.findOne({
    _id: applicationId,
    user: userId,
  }).lean();
  if (!app) {
    throw new AppError("Application not found", 404);
  }
  return app;
};

function hashState(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

async function gatherState(userId: string, applicationId: string) {
  const application = await ensureApplicationOwned(userId, applicationId);

  const job = application.job
    ? await Job.findById(application.job).lean()
    : null;

  const [events, emails, jobMatch, profile] = await Promise.all([
    ApplicationEvent.find({ user: userId, application: applicationId })
      .sort({ eventDate: -1 })
      .limit(50)
      .lean(),
    CareerEmail.find({ user: userId, application: applicationId })
      .sort({ receivedAt: -1 })
      .limit(50)
      .lean(),
    JobMatch.findOne({ user: userId, job: application.job }).sort({
      analyzedAt: -1,
    }).lean(),
    Profile.findOne({ user: userId }).lean(),
  ]);

  return { application, job, events, emails, jobMatch, profile };
}

export function buildSummaryInput(state: {
  application: unknown;
  job?: unknown;
  events: unknown[];
  emails: unknown[];
  jobMatch?: unknown;
  profile?: unknown;
}): ApplicationSummaryInput {
  const app = state.application as {
    status?: string;
    appliedAt?: Date;
    notes?: string;
  };
  const job = state.job as
    | {
        title?: string;
        companyName?: string;
        description?: string;
        locations?: string[];
        remoteType?: string;
        employmentType?: string;
        experienceLevel?: string;
        skills?: string[];
        technologies?: string[];
      }
    | undefined;
  const match = state.jobMatch as
    | {
        matchLevel?: string;
        score?: number;
        strengths?: string[];
        weaknesses?: string[];
        recommendation?: string;
      }
    | undefined;
  const profile = state.profile as
    | { headline?: string; summary?: string }
    | undefined;

  return {
    job: {
      title: job?.title ?? null,
      companyName: job?.companyName ?? null,
      description: job?.description ?? null,
      locations: job?.locations ?? null,
      remoteType: job?.remoteType ?? null,
      employmentType: job?.employmentType ?? null,
      experienceLevel: job?.experienceLevel ?? null,
      skills: job?.skills ?? null,
      technologies: job?.technologies ?? null,
    },
    application: {
      status: app?.status ?? null,
      appliedAt: app?.appliedAt ? app.appliedAt.toISOString() : null,
      notes: app?.notes ?? null,
    },
    timeline: (state.events as Array<{
      type?: string;
      title?: string;
      eventDate?: Date;
      source?: string;
    }>).map((e) => ({
      type: e?.type ?? null,
      title: e?.title ?? null,
      eventDate: e?.eventDate ? e.eventDate.toISOString() : null,
      source: e?.source ?? null,
    })),
    emails: (state.emails as Array<{
      category?: string;
      subject?: string;
      receivedAt?: Date;
      summary?: string;
    }>).map((e) => ({
      category: e?.category ?? null,
      subject: e?.subject ?? null,
      receivedAt: e?.receivedAt ? e.receivedAt.toISOString() : null,
      summary: e?.summary ?? null,
    })),
    jobMatch: match
      ? {
          matchLevel: match.matchLevel ?? null,
          score: typeof match.score === "number" ? match.score : null,
          strengths: match.strengths ?? null,
          weaknesses: match.weaknesses ?? null,
          recommendation: match.recommendation ?? null,
        }
      : null,
    profile: profile
      ? {
          headline: profile.headline ?? null,
          summary: profile.summary ?? null,
        }
      : null,
  };
}

async function runAnalysis(userId: string, applicationId: string) {
  const state = await gatherState(userId, applicationId);

  const stateHash = hashState({
    application: state.application,
    job: state.job,
    events: state.events,
    emails: state.emails,
    jobMatch: state.jobMatch,
  });

  const input = buildSummaryInput(state);

  const rawResult = await claudeService.analyzeApplicationSummary(input);

  const validation = validateApplicationSummaryAIOutput(rawResult);
  if (!validation.success) {
    throw new AppError(
      `Application summary validation failed: ${validation.error}`,
      422
    );
  }

  const cacheHours = getApplicationSummaryCacheHours();
  const analyzedAt = new Date();
  const expiresAt =
    cacheHours > 0
      ? new Date(analyzedAt.getTime() + cacheHours * 60 * 60 * 1000)
      : null;

  const summary = await ApplicationSummary.create({
    user: new Types.ObjectId(userId),
    application: new Types.ObjectId(applicationId),
    aiModel: getModel(),
    promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
    stateHash,
    summary: validation.data.summary,
    currentSituation: validation.data.currentSituation,
    strengths: validation.data.strengths,
    risks: validation.data.risks,
    nextActions: validation.data.nextActions,
    analyzedAt,
    expiresAt,
  });

  return { summary, cached: false };
}

export async function getApplicationSummary(
  userId: string,
  applicationId: string
): Promise<{ summary: IApplicationSummary | null; cached: boolean }> {
  await ensureApplicationOwned(userId, applicationId);

  const summary = await ApplicationSummary.findOne({
    user: userId,
    application: applicationId,
  }).sort({ analyzedAt: -1 });

  return { summary, cached: true };
}

export async function getOrCreateApplicationSummary(
  userId: string,
  applicationId: string
): Promise<{ summary: IApplicationSummary; cached: boolean }> {
  const state = await gatherState(userId, applicationId);

  const stateHash = hashState({
    application: state.application,
    job: state.job,
    events: state.events,
    emails: state.emails,
    jobMatch: state.jobMatch,
  });

  const now = new Date();
  const cached = await ApplicationSummary.findOne({
    user: userId,
    application: applicationId,
    stateHash,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  }).sort({ analyzedAt: -1 });

  if (cached) {
    return { summary: cached, cached: true };
  }

  const input = buildSummaryInput(state);

  const rawResult = await claudeService.analyzeApplicationSummary(input);

  const validation = validateApplicationSummaryAIOutput(rawResult);
  if (!validation.success) {
    throw new AppError(
      `Application summary validation failed: ${validation.error}`,
      422
    );
  }

  const cacheHours = getApplicationSummaryCacheHours();
  const analyzedAt = new Date();
  const expiresAt =
    cacheHours > 0
      ? new Date(analyzedAt.getTime() + cacheHours * 60 * 60 * 1000)
      : null;

  const summary = await ApplicationSummary.create({
    user: new Types.ObjectId(userId),
    application: new Types.ObjectId(applicationId),
    aiModel: getModel(),
    promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
    stateHash,
    summary: validation.data.summary,
    currentSituation: validation.data.currentSituation,
    strengths: validation.data.strengths,
    risks: validation.data.risks,
    nextActions: validation.data.nextActions,
    analyzedAt,
    expiresAt,
  });

  return { summary, cached: false };
}

export async function reanalyzeApplicationSummary(
  userId: string,
  applicationId: string
): Promise<{ summary: IApplicationSummary; cached: boolean }> {
  await ApplicationSummary.deleteMany({
    user: userId,
    application: applicationId,
  });
  return getOrCreateApplicationSummary(userId, applicationId);
}
