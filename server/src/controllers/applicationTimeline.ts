import { Request, Response, NextFunction } from "express";
import {
  createTimelineEventSchema,
  timelineQuerySchema,
  updateTimelineEventSchema,
} from "../validators/applicationTimeline";
import {
  createManualEvent,
  deleteManualEvent,
  listTimeline,
  updateManualEvent,
} from "../services/applicationTimeline";

const validationError = (res: Response, error: { issues: { path: (string | number)[]; message: string }[] }): void => {
  const details = error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
  res.status(422).json({
    error: "Validation failed",
    statusCode: 422,
    details,
  });
};

export const getTimeline = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = timelineQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const result = await listTimeline(req.user!.id, String(req.params.id), {
      page: parsed.data.page,
      limit: parsed.data.limit,
    });

    res.status(200).json({
      application: String(req.params.id),
      events: result.events.map(toSafeEvent),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const addTimelineEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = createTimelineEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const event = await createManualEvent(
      req.user!.id,
      String(req.params.id),
      {
        type: parsed.data.type,
        title: parsed.data.title,
        description: parsed.data.description,
        eventDate: new Date(parsed.data.eventDate),
      }
    );

    res.status(201).json({ event: toSafeEvent(event) });
  } catch (error) {
    next(error);
  }
};

export const updateTimelineEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = updateTimelineEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return validationError(res, parsed.error);
    }

    const data = parsed.data;
    const event = await updateManualEvent(
      req.user!.id,
      String(req.params.id),
      String(req.params.eventId),
      {
        type: data.type,
        title: data.title,
        description: data.description,
        eventDate: data.eventDate ? new Date(data.eventDate) : undefined,
      }
    );

    res.status(200).json({ event: toSafeEvent(event) });
  } catch (error) {
    next(error);
  }
};

export const removeTimelineEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await deleteManualEvent(
      req.user!.id,
      String(req.params.id),
      String(req.params.eventId)
    );
    res.status(200).json({ message: "Timeline event deleted" });
  } catch (error) {
    next(error);
  }
};

function toSafeEvent(event: {
  _id: unknown;
  application: unknown;
  type: unknown;
  source: unknown;
  title: unknown;
  description?: unknown;
  eventDate: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}): Record<string, unknown> {
  return {
    id: event._id,
    application: event.application,
    type: event.type,
    source: event.source,
    title: event.title,
    description: event.description ?? undefined,
    eventDate: event.eventDate,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}
