import { Types } from "mongoose";
import ApplicationEvent, {
  ApplicationEventType,
  IApplicationEvent,
} from "../models/ApplicationEvent";
import { Application } from "../models/Application";
import { AppError } from "../middleware/errorHandler";

export interface TimelineListResult {
  events: IApplicationEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateEventInput {
  type: ApplicationEventType;
  title: string;
  description?: string;
  eventDate: Date;
}

const ensureValidAppId = (id: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Application not found", 404);
  }
  return new Types.ObjectId(id);
};

const ensureApplicationOwned = async (userId: string, appId: string): Promise<Types.ObjectId> => {
  const validId = ensureValidAppId(appId);
  const app = await Application.exists({ _id: validId, user: userId });
  if (!app) {
    throw new AppError("Application not found", 404);
  }
  return validId;
};

// Create a status-history event. Idempotent for unchanged status (no event).
export async function createStatusChangedEvent(
  userId: string,
  applicationId: string,
  toStatus: string
): Promise<void> {
  const validId = ensureValidAppId(applicationId);
  await ApplicationEvent.create({
    user: new Types.ObjectId(userId),
    application: validId,
    type: "status_changed",
    source: "system",
    title: `Status changed to ${toStatus}`,
    description: `Application status updated to ${toStatus}`,
    eventDate: new Date(),
  });
}

export async function createApplicationCreatedEvent(
  userId: string,
  applicationId: string
): Promise<void> {
  const validId = ensureValidAppId(applicationId);
  await ApplicationEvent.create({
    user: new Types.ObjectId(userId),
    application: validId,
    type: "application_created",
    source: "system",
    title: "Application created",
    description: "Started tracking this application.",
    eventDate: new Date(),
  });
}

// Create a Gmail-derived event, idempotent on (application, source, sourceId).
export async function createGmailEvent(
  userId: string,
  applicationId: string,
  input: {
    type: ApplicationEventType;
    title: string;
    description?: string;
    eventDate: Date;
    sourceId: string;
  }
): Promise<IApplicationEvent | null> {
  if (!Types.ObjectId.isValid(applicationId)) {
    return null;
  }
  const existing = await ApplicationEvent.findOne({
    application: new Types.ObjectId(applicationId),
    source: "gmail",
    sourceId: input.sourceId,
  });
  if (existing) {
    return existing;
  }

  return ApplicationEvent.create({
    user: new Types.ObjectId(userId),
    application: new Types.ObjectId(applicationId),
    type: input.type,
    source: "gmail",
    title: input.title,
    description: input.description,
    eventDate: input.eventDate,
    sourceId: input.sourceId,
  });
}

export async function listTimeline(
  userId: string,
  applicationId: string,
  options: { page: number; limit: number }
): Promise<TimelineListResult> {
  const validId = await ensureApplicationOwned(userId, applicationId);
  const { page, limit } = options;
  const skip = (page - 1) * limit;
  const filter = { user: userId, application: validId };

  const [events, total] = await Promise.all([
    ApplicationEvent.find(filter)
      .sort({ eventDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ApplicationEvent.countDocuments(filter),
  ]);

  return {
    events: events as unknown as IApplicationEvent[],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function createManualEvent(
  userId: string,
  applicationId: string,
  input: CreateEventInput
): Promise<IApplicationEvent> {
  const validId = await ensureApplicationOwned(userId, applicationId);
  const event = await ApplicationEvent.create({
    user: new Types.ObjectId(userId),
    application: validId,
    type: input.type,
    source: "user",
    title: input.title,
    description: input.description,
    eventDate: input.eventDate,
  });
  return event;
}

export interface UpdateEventInput {
  type?: ApplicationEventType;
  title?: string;
  description?: string;
  eventDate?: Date;
}

export async function updateManualEvent(
  userId: string,
  applicationId: string,
  eventId: string,
  input: UpdateEventInput
): Promise<IApplicationEvent> {
  const validId = await ensureApplicationOwned(userId, applicationId);

  if (!Types.ObjectId.isValid(eventId)) {
    throw new AppError("Timeline event not found", 404);
  }

  const updateData: Record<string, unknown> = {};
  if (input.type !== undefined) updateData.type = input.type;
  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.eventDate !== undefined) updateData.eventDate = input.eventDate;

  const event = await ApplicationEvent.findOneAndUpdate(
    {
      _id: new Types.ObjectId(eventId),
      user: userId,
      application: validId,
      source: "user",
    },
    { $set: updateData },
    { new: true, runValidators: true }
  );

  if (!event) {
    throw new AppError("Timeline event not found", 404);
  }
  return event;
}

export async function deleteManualEvent(
  userId: string,
  applicationId: string,
  eventId: string
): Promise<void> {
  const validId = await ensureApplicationOwned(userId, applicationId);

  if (!Types.ObjectId.isValid(eventId)) {
    throw new AppError("Timeline event not found", 404);
  }

  const deleted = await ApplicationEvent.findOneAndDelete({
    _id: new Types.ObjectId(eventId),
    user: userId,
    application: validId,
    source: "user",
  });

  if (!deleted) {
    throw new AppError("Timeline event not found", 404);
  }
}
