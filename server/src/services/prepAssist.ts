import { Types } from "mongoose";
import { Application } from "../models/Application";
import { ApplicationEvent } from "../models/ApplicationEvent";
import { CareerEmail } from "../models/CareerEmail";
import Job from "../models/Job";
import JobMatch from "../models/JobMatch";
import { InterviewPreparation } from "../models/InterviewPreparation";
import { ClaudeService } from "../integrations/claude/claude.service";
import { InterviewPrepAssistInput } from "../integrations/claude/interviewPrepAssistPrompts";
import { validatePrepAssistAIOutput, PrepAssistAIOutput } from "../validators/prepAssist";
import { AppError } from "../middleware/errorHandler";

const claudeService = new ClaudeService();

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

async function gatherState(userId: string, applicationId: string) {
  const application = await ensureApplicationOwned(userId, applicationId);

  const job = application.job
    ? await Job.findById(application.job).lean()
    : null;

  const [events, emails, jobMatch, preparation] = await Promise.all([
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
    InterviewPreparation.findOne({
      user: userId,
      application: applicationId,
    }).lean(),
  ]);

  return { application, job, events, emails, jobMatch, preparation };
}

export function buildPrepAssistInput(state: {
  application: unknown;
  job?: unknown;
  events: unknown[];
  emails: unknown[];
  jobMatch?: unknown;
  preparation?: unknown;
}): InterviewPrepAssistInput {
  const app = state.application as {
    status?: string;
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
  const prep = state.preparation as
    | {
        goals?: string[];
        talkingPoints?: string[];
        questionsToAsk?: string[];
        companyResearchNotes?: string;
        rolePreparationNotes?: string;
        checklist?: Array<{ key?: string; completed?: boolean }>;
      }
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
    existingPreparation: prep
      ? {
          goals: prep.goals ?? null,
          talkingPoints: prep.talkingPoints ?? null,
          questionsToAsk: prep.questionsToAsk ?? null,
          companyResearchNotes: prep.companyResearchNotes ?? null,
          rolePreparationNotes: prep.rolePreparationNotes ?? null,
          checklist: prep.checklist ?? null,
        }
      : null,
  };
}

export async function generatePrepAssist(
  userId: string,
  applicationId: string
): Promise<PrepAssistAIOutput> {
  const state = await gatherState(userId, applicationId);

  const input = buildPrepAssistInput(state);

  const rawResult = await claudeService.assistInterviewPreparation(input);

  const validation = validatePrepAssistAIOutput(rawResult);
  if (!validation.success) {
    throw new AppError(
      `Interview preparation assist validation failed: ${validation.error}`,
      422
    );
  }

  return validation.data;
}
