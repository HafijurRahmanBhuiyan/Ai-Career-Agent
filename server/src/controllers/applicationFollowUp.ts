import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { Application } from "../models/Application";
import { ApplicationFollowUp } from "../models/ApplicationFollowUp";
import { AppError } from "../middleware/errorHandler";
import {
  CreateFollowUpInput,
  UpdateFollowUpInput,
  followUpListQuerySchema,
} from "../validators/applicationFollowUp";

const ensureApplicationOwned = async (
  userId: string,
  appId: string
): Promise<Types.ObjectId> => {
  if (!Types.ObjectId.isValid(appId)) {
    throw new AppError("Application not found", 404);
  }
  const app = await Application.exists({ _id: appId, user: userId });
  if (!app) {
    throw new AppError("Application not found", 404);
  }
  return new Types.ObjectId(appId);
};

const toSafeFollowUp = <T extends object>(
  followUp: T
): Record<string, unknown> => {
  const source =
    followUp &&
    typeof (followUp as { toObject?: unknown }).toObject === "function"
      ? (followUp as unknown as { toObject: () => Record<string, unknown> }).toObject()
      : followUp;
  const { __v, user, _id, ...safe } = source as Record<string, unknown>;
  void __v;
  void user;
  void _id;
  safe.application = safe.application ? String(safe.application) : undefined;
  return { ...safe, id: _id };
};

export const listFollowUps = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const appId = await ensureApplicationOwned(userId, String(req.params.id));

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

    const filter: Record<string, unknown> = {
      user: userId,
      application: appId,
    };
    if (parsed.data.completed !== undefined) {
      filter.completed = parsed.data.completed === "true";
    }
    if (parsed.data.priority !== undefined) {
      filter.priority = parsed.data.priority;
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    switch (parsed.data.due) {
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
      default:
        break;
    }

    const page = parsed.data.page ?? 1;
    const limit = parsed.data.limit;
    const skip = (page - 1) * limit;

    const [followUps, total] = await Promise.all([
      ApplicationFollowUp.find(filter)
        .sort({ dueAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ApplicationFollowUp.countDocuments(filter),
    ]);

    res.status(200).json({
      followUps: followUps.map(toSafeFollowUp),
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

export const createFollowUp = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const appId = await ensureApplicationOwned(userId, String(req.params.id));
    const body = req.body as CreateFollowUpInput;

    const followUp = await ApplicationFollowUp.create({
      user: userId,
      application: appId,
      action: body.action,
      note: body.note ?? null,
      dueAt: new Date(body.dueAt),
      priority: body.priority ?? "medium",
      completed: false,
      completedAt: null,
    });

    res.status(201).json({ followUp: toSafeFollowUp(followUp.toObject()) });
  } catch (error) {
    next(error);
  }
};

export const updateFollowUp = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const appId = await ensureApplicationOwned(userId, String(req.params.id));
    const followUpId = String(req.params.followUpId);

    if (!Types.ObjectId.isValid(followUpId)) {
      throw new AppError("Follow-up not found", 404);
    }

    const body = req.body as UpdateFollowUpInput;

    const existing = await ApplicationFollowUp.findOne({
      _id: followUpId,
      user: userId,
      application: appId,
    });

    if (!existing) {
      throw new AppError("Follow-up not found", 404);
    }

    const update: Record<string, unknown> = {};
    if (body.action !== undefined) update.action = body.action;
    if (body.note !== undefined) update.note = body.note;
    if (body.dueAt !== undefined) update.dueAt = new Date(body.dueAt);
    if (body.priority !== undefined) update.priority = body.priority;

    if (body.completed !== undefined && body.completed !== existing.completed) {
      update.completed = body.completed;
      update.completedAt = body.completed ? new Date() : null;
    }

    const updated = await ApplicationFollowUp.findOneAndUpdate(
      { _id: followUpId, user: userId, application: appId },
      { $set: update },
      { new: true, runValidators: true }
    );

    res.status(200).json({ followUp: toSafeFollowUp(updated!.toObject()) });
  } catch (error) {
    next(error);
  }
};

export const deleteFollowUp = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const appId = await ensureApplicationOwned(userId, String(req.params.id));
    const followUpId = String(req.params.followUpId);

    if (!Types.ObjectId.isValid(followUpId)) {
      throw new AppError("Follow-up not found", 404);
    }

    const deleted = await ApplicationFollowUp.findOneAndDelete({
      _id: followUpId,
      user: userId,
      application: appId,
    });

    if (!deleted) {
      throw new AppError("Follow-up not found", 404);
    }

    res.status(200).json({ message: "Follow-up deleted" });
  } catch (error) {
    next(error);
  }
};
