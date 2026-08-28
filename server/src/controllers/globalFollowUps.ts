import { Request, Response, NextFunction } from "express";
import { Application } from "../models/Application";
import { ApplicationFollowUp } from "../models/ApplicationFollowUp";
import {
  followUpListQuerySchema,
  FollowUpListQuery,
} from "../validators/applicationFollowUp";
import {
  classifyFollowUp,
  FollowUpUrgency,
  urgencyRank,
} from "../services/followUpClassification";

const JOB_POPULATE_FIELDS = "title companyName location";

interface LeanFollowUp {
  _id: unknown;
  user: unknown;
  action: string;
  note?: string | null;
  dueAt: Date;
  priority: "low" | "medium" | "high";
  completed: boolean;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  application: {
    _id: string;
    status: string;
    job?: {
      title?: string;
      companyName?: string;
    } | null;
  };
}

function toSafeFollowUp(followUp: LeanFollowUp): Record<string, unknown> {
  return {
    id: String(followUp._id),
    action: followUp.action,
    note: followUp.note ?? null,
    dueAt: followUp.dueAt.toISOString(),
    priority: followUp.priority,
    completed: followUp.completed,
    completedAt: followUp.completedAt
      ? followUp.completedAt.toISOString()
      : null,
    application: {
      _id: String(followUp.application._id),
      status: followUp.application.status,
      job: followUp.application.job
        ? {
            title: followUp.application.job.title ?? null,
            companyName: followUp.application.job.companyName ?? null,
          }
        : null,
    },
  };
}

function buildMongoFilter(query: FollowUpListQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = { user: undefined as unknown as string };
  delete filter.user;

  if (query.completed !== undefined) {
    filter.completed = query.completed === "true";
  }
  if (query.priority !== undefined) {
    filter.priority = query.priority;
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  switch (query.due) {
    case "overdue":
      filter.completed = false;
      filter.dueAt = { $lt: now };
      break;
    case "due_today":
      filter.completed = false;
      filter.dueAt = { $gte: todayStart, $lt: todayEnd };
      break;
    case "upcoming":
      filter.completed = false;
      filter.dueAt = { $gte: todayEnd };
      break;
    case "completed":
      filter.completed = true;
      break;
    case "inactive":
      // Inactive is derived from application status and cannot be a simple
      // Mongo filter; handled below by fetching matching applications first.
      break;
  }

  return filter;
}

export const listGlobalFollowUps = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;

    const parsed = followUpListQuerySchema.safeParse(req.query);
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

    const query = parsed.data;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // Inactive filter requires resolving application status first, so treat
    // it as a two-step query scoped to the requesting user.
    if (query.due === "inactive") {
      return listInactiveFollowUps(userId, query, page, limit, res);
    }

    const filter = buildMongoFilter(query);
    filter.user = userId;

    const [followUps, total] = await Promise.all([
      ApplicationFollowUp.find(filter)
        .populate({
          path: "application",
          select: "status job",
          populate: { path: "job", select: JOB_POPULATE_FIELDS },
        })
        .sort({ dueAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ApplicationFollowUp.countDocuments(filter),
    ]);

    const result = (followUps as unknown as LeanFollowUp[]).map(toSafeFollowUp);
    result.sort((a, b) => {
      const aApp = a.application as { status?: string };
      const bApp = b.application as { status?: string };
      const aRank = urgencyRank(
        classifyFollowUp(
          { completed: a.completed as boolean, dueAt: new Date(a.dueAt as string) },
          aApp
        ),
        a.priority as "low" | "medium" | "high"
      );
      const bRank = urgencyRank(
        classifyFollowUp(
          { completed: b.completed as boolean, dueAt: new Date(b.dueAt as string) },
          bApp
        ),
        b.priority as "low" | "medium" | "high"
      );
      if (aRank !== bRank) return aRank - bRank;
      return new Date(a.dueAt as string).getTime() - new Date(b.dueAt as string).getTime();
    });

    res.status(200).json({
      followUps: result,
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

async function listInactiveFollowUps(
  userId: string,
  query: FollowUpListQuery,
  page: number,
  limit: number,
  res: Response
): Promise<void> {
  const inactiveApps = await Application.find({
    user: userId,
    status: { $in: ["rejected", "withdrawn"] },
  })
    .select("_id")
    .lean();

  const appIds = inactiveApps.map((app) => String(app._id));
  if (appIds.length === 0) {
    res.status(200).json({
      followUps: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    });
    return;
  }

  const filter: Record<string, unknown> = {
    user: userId,
    application: { $in: appIds },
    completed: false,
  };
  if (query.priority !== undefined) {
    filter.priority = query.priority;
  }

  const [followUps, total] = await Promise.all([
    ApplicationFollowUp.find(filter)
      .populate({
        path: "application",
        select: "status job",
        populate: { path: "job", select: JOB_POPULATE_FIELDS },
      })
      .sort({ dueAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ApplicationFollowUp.countDocuments(filter),
  ]);

  const result = (followUps as unknown as LeanFollowUp[]).map(toSafeFollowUp);
  result.sort(
    (a, b) =>
      new Date(a.dueAt as string).getTime() - new Date(b.dueAt as string).getTime()
  );

  res.status(200).json({
    followUps: result,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
