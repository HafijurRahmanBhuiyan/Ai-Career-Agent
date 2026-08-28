import { Types } from "mongoose";
import { Application } from "../models/Application";
import { ApplicationEvent } from "../models/ApplicationEvent";
import { CareerEmail } from "../models/CareerEmail";
import { InterviewPreparation } from "../models/InterviewPreparation";
import { ApplicationFollowUp } from "../models/ApplicationFollowUp";
import { ClaudeService } from "../integrations/claude/claude.service";
import { FollowUpAssistInput } from "../integrations/claude/followUpAssistPrompts";
import { validateFollowUpAssistAIOutput } from "../validators/followUpAssist";
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
    ? await import("../models/Job").then((m) =>
        m.default.findById(application.job).lean()
      )
    : null;

  const [events, emails, existingFollowUps, preparation] = await Promise.all([
    ApplicationEvent.find({ user: userId, application: applicationId })
      .sort({ eventDate: -1 })
      .limit(40)
      .lean(),
    CareerEmail.find({ user: userId, application: applicationId })
      .sort({ receivedAt: -1 })
      .limit(40)
      .lean(),
    ApplicationFollowUp.find({ user: userId, application: applicationId })
      .sort({ dueAt: 1 })
      .limit(50)
      .lean(),
    InterviewPreparation.findOne({
      user: userId,
      application: applicationId,
    }).lean(),
  ]);

  return { application, job, events, emails, existingFollowUps, preparation };
}

export function buildFollowUpAssistInput(state: {
  application: unknown;
  job?: unknown;
  events: unknown[];
  emails: unknown[];
  existingFollowUps: unknown[];
  preparation?: unknown;
}): FollowUpAssistInput {
  const app = state.application as { status?: string; notes?: string };
  const job = state.job as
    | {
        title?: string;
        companyName?: string;
        locations?: string[];
        remoteType?: string;
        employmentType?: string;
      }
    | undefined;

  const interviewEmail = state.emails as Array<{
    interview?: {
      scheduledAt?: Date | null;
      type?: string | null;
    } | null;
  }>;
  const interview =
    interviewEmail.find((e) => e.interview?.scheduledAt)?.interview ?? null;

  const prep = state.preparation as
    | { checklist?: Array<{ completed?: boolean }> }
    | undefined;
  const checklist = prep?.checklist ?? [];

  return {
    job: {
      title: job?.title ?? null,
      companyName: job?.companyName ?? null,
      locations: job?.locations ?? null,
      remoteType: job?.remoteType ?? null,
      employmentType: job?.employmentType ?? null,
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
    interview: interview
      ? {
          scheduledAt: interview.scheduledAt
            ? interview.scheduledAt.toISOString()
            : null,
          type: interview.type ?? null,
        }
      : null,
    existingFollowUps: (state.existingFollowUps as Array<{
      action?: string;
      note?: string | null;
      dueAt?: Date;
      priority?: string;
      completed?: boolean;
    }>).map((f) => ({
      action: f?.action ?? null,
      note: f?.note ?? null,
      dueAt: f?.dueAt ? f.dueAt.toISOString() : null,
      priority: f?.priority ?? null,
      completed: f?.completed ?? null,
    })),
    existingPreparation: {
      preparedCount: checklist.filter((item) => item.completed === true).length,
      totalChecklistItems: checklist.length,
    },
  };
}

export async function generateFollowUpAssist(
  userId: string,
  applicationId: string
) {
  const state = await gatherState(userId, applicationId);

  const input = buildFollowUpAssistInput(state);

  const rawResult = await claudeService.assistFollowUps(input);

  const validation = validateFollowUpAssistAIOutput(rawResult);
  if (!validation.success) {
    throw new AppError(
      `Follow-up assist validation failed: ${validation.error}`,
      422
    );
  }

  return validation.data;
}
