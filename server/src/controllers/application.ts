import { Request, Response, NextFunction } from "express";
import { Application } from "../models/Application";
import Job from "../models/Job";
import { CareerEmail } from "../models/CareerEmail";
import { ApplicationEvent } from "../models/ApplicationEvent";
import { ApplicationSummary } from "../models/ApplicationSummary";
import { InterviewPreparation } from "../models/InterviewPreparation";
import { ApplicationFollowUp } from "../models/ApplicationFollowUp";
import JobMatch from "../models/JobMatch";
import { AppError } from "../middleware/errorHandler";
import {
  applicationListQuerySchema,
  CreateApplicationInput,
  UpdateApplicationInput,
} from "../validators/application";
import {
  createApplicationCreatedEvent,
  createStatusChangedEvent,
} from "../services/applicationTimeline";
import {
  buildFollowUpActionSummary,
  buildPreparationSummary,
} from "../services/followUpClassification";

const JOB_POPULATE_FIELDS =
  "title companyName location locations remoteType employmentType source jobUrl applyUrl applyCapability";

const isDuplicateKeyError = (error: unknown): boolean => {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
};

const getApplicationForUser = async (
  userId: string,
  appId: string,
  { populateJob = true } = {}
) => {
  const query = Application.findOne({ _id: appId, user: userId });
  if (populateJob) {
    query.populate("job", JOB_POPULATE_FIELDS);
  }
  return query.lean();
};

export const createApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const body = req.body as CreateApplicationInput;

    const job = await Job.findOne({ _id: body.jobId, isActive: true }).lean();
    if (!job) {
      return next(new AppError("Job not found", 404));
    }

    const status = body.status ?? "saved";

    let appliedAt: Date | undefined;
    if (body.appliedAt) {
      appliedAt = new Date(body.appliedAt);
    } else if (status === "applied") {
      appliedAt = new Date();
    }

    const application = new Application({
      user: userId,
      job: body.jobId,
      status,
      appliedAt,
      notes: body.notes,
    });

    try {
      await application.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return next(new AppError("Application already exists for this job", 409));
      }
      throw error;
    }

    await application.populate("job", JOB_POPULATE_FIELDS);

    await createApplicationCreatedEvent(userId, String(application._id));

    res.status(201).json({ application: toSafeApplication(application) });
  } catch (error) {
    next(error);
  }
};

export const getApplications = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;

    const parsed = applicationListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return res.status(422).json({
        error: "Validation failed",
        statusCode: 422,
        details,
      });
    }

    const { page, limit, status } = parsed.data;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = { user: userId };
    if (status) {
      filter.status = status;
    }

    const [applications, total] = await Promise.all([
      Application.find(filter)
        .populate("job", JOB_POPULATE_FIELDS)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Application.countDocuments(filter),
    ]);

    // Batch-load per-application detection summary + latest status event for
    // the current page only (avoids an N+1 query over the page's applications).
    const appIds = applications.map((app) => app._id);
    const [detections, statusEvents, careerEventRows] = await Promise.all([
      appIds.length > 0
        ? CareerEmail.find({
            user: userId,
            application: { $in: appIds },
            careerStatus: { $ne: null },
          })
            .sort({ careerStatusDetectedAt: -1 })
            .select(
              "application careerStatus careerStatusConfidence careerStatusDetectedAt autoStatusApplied autoStatusReason manualStatusApplied manualStatusAppliedAt manualStatusReason"
            )
            .lean()
        : [],
      appIds.length > 0
        ? ApplicationEvent.find({
            user: userId,
            application: { $in: appIds },
            type: "status_changed",
          })
            .sort({ eventDate: -1, createdAt: -1 })
            .select("application title eventDate source")
            .lean()
        : [],
      appIds.length > 0
        ? CareerEmail.find({
            user: userId,
            application: { $in: appIds },
            careerEvent: { $ne: null },
          })
            .sort({ receivedAt: -1 })
            .select("application receivedAt careerEvent")
            .lean()
        : [],
    ]);

    const detectionByApp = new Map<string, (typeof detections)[number]>();
    for (const d of detections) {
      const key = String(d.application);
      if (!detectionByApp.has(key)) {
        detectionByApp.set(key, d);
      }
    }

    const eventByApp = new Map<string, (typeof statusEvents)[number]>();
    for (const e of statusEvents) {
      const key = String(e.application);
      if (!eventByApp.has(key)) {
        eventByApp.set(key, e);
      }
    }

    const careerEventByApp = new Map<string, (typeof careerEventRows)[number]>();
    for (const row of careerEventRows) {
      const key = String(row.application);
      if (!careerEventByApp.has(key)) {
        careerEventByApp.set(key, row);
      }
    }

    const enriched = applications.map((app) => {
      const safe = toSafeApplication(app);
      const appId = String(app._id);
      const detection = detectionByApp.get(appId);
      const event = eventByApp.get(appId);
      const careerRow = careerEventByApp.get(appId);
      return {
        ...safe,
        careerEmailDetection: detection
          ? {
              id: String(detection._id),
              careerStatus: detection.careerStatus,
              careerStatusConfidence:
                detection.careerStatusConfidence ?? null,
              careerStatusDetectedAt: detection.careerStatusDetectedAt
                ? detection.careerStatusDetectedAt.toISOString()
                : null,
              autoStatusApplied: detection.autoStatusApplied ?? false,
              autoStatusReason: detection.autoStatusReason ?? null,
              manualStatusApplied: detection.manualStatusApplied ?? false,
              manualStatusAppliedAt: detection.manualStatusAppliedAt
                ? detection.manualStatusAppliedAt.toISOString()
                : null,
              manualStatusReason: detection.manualStatusReason ?? null,
            }
          : null,
        latestCareerEvent: careerRow?.careerEvent
          ? serializeCareerEvent(careerRow.careerEvent)
          : null,
        latestStatusEvent: event
          ? {
              id: String(event._id),
              title: event.title,
              eventDate: event.eventDate.toISOString(),
              source: event.source,
            }
          : null,
      };
    });

    res.status(200).json({
      applications: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const appId = String(req.params.id);

    if (!isValidObjectId(appId)) {
      return next(new AppError("Application not found", 404));
    }

    const application = await getApplicationForUser(userId, appId);

    if (!application) {
      return next(new AppError("Application not found", 404));
    }

    const [events, emails, jobMatch, aiSummary, prep, followUps] =
      await Promise.all([
        ApplicationEvent.find({ user: userId, application: appId })
          .sort({ eventDate: -1 })
          .limit(100)
          .lean(),
        CareerEmail.find({ user: userId, application: appId })
          .sort({ receivedAt: -1 })
          .limit(50)
          .lean(),
        JobMatch.findOne({ user: userId, job: application.job }).sort({
          analyzedAt: -1,
        }).lean(),
        ApplicationSummary.findOne({ user: userId, application: appId }).sort({
          analyzedAt: -1,
        }).lean(),
        InterviewPreparation.findOne({
          user: userId,
          application: appId,
        }).lean(),
        ApplicationFollowUp.find({ user: userId, application: appId })
          .sort({ dueAt: 1 })
          .limit(50)
          .lean(),
      ]);

    const interview =
      buildInterviewFromEmails(emails as unknown as EmailLike[]);

    const actionSummary = buildFollowUpActionSummary(
      followUps as unknown as {
        completed: boolean;
        dueAt: Date;
        priority?: string;
      }[],
      application
    );
    const preparationSummary = buildPreparationSummary(prep);

    res.status(200).json({
      application: toSafeApplication(application),
      timeline: {
        count: events.length,
        latest:
          events.length > 0 ? toSafeTimelineEvent(events[0]) : null,
      },
      emails: (emails as unknown as EmailLike[]).map(toSafeEmail),
      jobMatch: jobMatch ? toSafeJobMatch(jobMatch) : null,
      interview,
      aiSummary: aiSummary ? toSafeSummary(aiSummary) : null,
      preparation: prep ? toSafePreparation(prep) : null,
      followUps: followUps.map(toSafeFollowUp),
      actionSummary,
      preparationSummary,
    });
  } catch (error) {
    next(error);
  }
};

export const updateApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const body = req.body as UpdateApplicationInput;
    const appId = String(req.params.id);

    const existing = await Application.findOne({ _id: appId, user: userId }).lean();
    if (!existing) {
      return next(new AppError("Application not found", 404));
    }

    const updateData: Record<string, unknown> = {};

    let statusChanged = false;
    if (body.status !== undefined) {
      updateData.status = body.status;
      statusChanged = existing.status !== body.status;
    }

    if (body.appliedAt !== undefined) {
      // Explicitly clearing the date is allowed (e.g. appliedAt: null).
      updateData.appliedAt = body.appliedAt === null ? null : new Date(body.appliedAt);
    } else if (
      body.status === "applied" &&
      existing.status !== "applied" &&
      existing.appliedAt === undefined
    ) {
      // Transitioning to "applied" without a date -> set it to now.
      updateData.appliedAt = new Date();
    }

    if (body.notes !== undefined) {
      updateData.notes = body.notes;
    }

    const application = await Application.findOneAndUpdate(
      { _id: appId, user: userId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate("job", JOB_POPULATE_FIELDS);

    if (!application) {
      return next(new AppError("Application not found", 404));
    }

    if (statusChanged) {
      await createStatusChangedEvent(userId, appId, String(application.status));
    }

    res.status(200).json({ application: toSafeApplication(application) });
  } catch (error) {
    next(error);
  }
};

export const deleteApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const application = await Application.findOneAndDelete({
      _id: req.params.id,
      user: userId,
    });

    if (!application) {
      return next(new AppError("Application not found", 404));
    }

    res.status(200).json({ message: "Application deleted" });
  } catch (error) {
    next(error);
  }
};

function toSafeApplication<T extends object>(
  application: T
): Record<string, unknown> {
  const source =
    application &&
    typeof (application as { toObject?: unknown }).toObject === "function"
      ? (application as unknown as { toObject: () => Record<string, unknown> }).toObject()
      : application;

  const { __v, user, ...safe } = source as Record<string, unknown>;
  void __v;
  void user;

  if (safe.job && typeof safe.job === "object") {
    const jobRecord = safe.job as Record<string, unknown>;
    const { rawSource, metadata, ...safeJob } = jobRecord;
    void rawSource;
    void metadata;
    safe.job = safeJob;
  }

  return safe;
}

const isValidObjectId = (id: string): boolean => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

// Serializes the careerEvent subdocument for the dashboard. Only safe, extracted
// fields are exposed; Dates are converted to ISO strings. Meeting URLs are
// already restricted to http(s) at extraction and re-validated here.
function serializeCareerEvent(event: unknown): Record<string, unknown> {
  const record = (event || {}) as Record<string, unknown>;
  const isIso = (value: unknown): value is Date =>
    value instanceof Date && !Number.isNaN(value.getTime());

  const safe: Record<string, unknown> = {};
  for (const key of [
    "type",
    "confidence",
    "title",
    "company",
    "role",
    "timezone",
    "durationMinutes",
    "interviewerName",
    "interviewerEmail",
    "meetingUrl",
    "meetingPlatform",
    "location",
    "phone",
    "actionRequired",
    "actionText",
    "candidateResponseRequired",
    "evidence",
  ]) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") {
      safe[key] = value;
    }
  }
  if (isIso(record.scheduledAt)) safe.scheduledAt = record.scheduledAt.toISOString();
  if (isIso(record.deadlineAt)) safe.deadlineAt = record.deadlineAt.toISOString();
  if (isIso(record.detectedAt)) safe.detectedAt = record.detectedAt.toISOString();
  if (record.deadlineTimezone != null) safe.deadlineTimezone = record.deadlineTimezone;

  return safe;
}

interface EmailLike {
  _id: unknown;
  user?: unknown;
  rawMetadata?: unknown;
  gmailMessageId?: string;
  subject?: string;
  from?: string;
  receivedAt?: unknown;
  category?: string;
  confidence?: number;
  summary?: string;
  companyName?: string;
  jobTitle?: string;
  suggestedApplicationStatus?: string;
  interviewDate?: unknown;
  interviewType?: string;
  interview?: unknown;
  actionRequired?: boolean | null;
  actionDeadline?: unknown;
}

function toSafeEmail(email: EmailLike): Record<string, unknown> {
  const record = email as unknown as Record<string, unknown>;
  const { _id, user, rawMetadata, ...safe } = record;
  void user;
  void rawMetadata;
  return {
    ...safe,
    id: _id,
  };
}

function buildInterviewFromEmails(emails: EmailLike[]): Record<string, unknown> | null {
  for (const email of emails) {
    const interview = email.interview as Record<string, unknown> | null | undefined;
    if (interview && Object.keys(interview).some((k) => interview[k] != null)) {
      return interview as Record<string, unknown>;
    }
  }
  return null;
}

function toSafeTimelineEvent(event: {
  _id: unknown;
  type: unknown;
  source: unknown;
  title: unknown;
  description?: unknown;
  eventDate: unknown;
}): Record<string, unknown> {
  return {
    id: event._id,
    type: event.type,
    source: event.source,
    title: event.title,
    description: event.description ?? undefined,
    eventDate: event.eventDate,
  };
}

function toSafeJobMatch<T extends object>(match: T): Record<string, unknown> {
  const source =
    match &&
    typeof (match as { toObject?: unknown }).toObject === "function"
      ? (match as unknown as { toObject: () => Record<string, unknown> }).toObject()
      : match;
  const { __v, user, ...safe } = source as Record<string, unknown>;
  void __v;
  void user;
  if (safe.job && typeof safe.job === "object") {
    const jobRecord = safe.job as Record<string, unknown>;
    const { rawSource, metadata, ...safeJob } = jobRecord;
    void rawSource;
    void metadata;
    safe.job = safeJob;
  }
  return safe;
}

function toSafeSummary<T extends object>(summary: T): Record<string, unknown> {
  const source =
    summary &&
    typeof (summary as { toObject?: unknown }).toObject === "function"
      ? (summary as unknown as { toObject: () => Record<string, unknown> }).toObject()
      : summary;
  const { __v, user, ...safe } = source as Record<string, unknown>;
  void __v;
  void user;
  return safe;
}

function toSafePreparation<T extends object>(
  preparation: T
): Record<string, unknown> {
  const source =
    preparation &&
    typeof (preparation as { toObject?: unknown }).toObject === "function"
      ? (preparation as unknown as { toObject: () => Record<string, unknown> }).toObject()
      : preparation;
  const { __v, user, _id, ...safe } = source as Record<string, unknown>;
  void __v;
  void user;
  void _id;
  return safe;
}

function toSafeFollowUp<T extends object>(followUp: T): Record<string, unknown> {
  const source =
    followUp &&
    typeof (followUp as { toObject?: unknown }).toObject === "function"
      ? (followUp as unknown as { toObject: () => Record<string, unknown> }).toObject()
      : followUp;
  const { __v, user, _id, application, ...safe } = source as Record<string, unknown>;
  void __v;
  void user;
  return {
    ...safe,
    id: _id,
    application: application ? String(application) : undefined,
  };
}
