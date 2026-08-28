import mongoose, { Document, Schema, Types } from "mongoose";

export const APPLICATION_EVENT_TYPES = [
  "application_created",
  "status_changed",
  "interview_scheduled",
  "recruiter_contact",
  "assessment",
  "offer_received",
  "rejection_received",
  "note",
  "other",
] as const;

export type ApplicationEventType =
  (typeof APPLICATION_EVENT_TYPES)[number];

export const APPLICATION_EVENT_SOURCES = ["user", "gmail", "system"] as const;

export type ApplicationEventSource =
  (typeof APPLICATION_EVENT_SOURCES)[number];

export interface IApplicationEvent extends Document {
  user: Types.ObjectId;
  application: Types.ObjectId;
  type: ApplicationEventType;
  source: ApplicationEventSource;
  title: string;
  description?: string;
  eventDate: Date;
  sourceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const applicationEventSchema = new Schema<IApplicationEvent>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    application: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: APPLICATION_EVENT_TYPES,
      required: true,
    },
    source: {
      type: String,
      enum: APPLICATION_EVENT_SOURCES,
      default: "user",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    eventDate: {
      type: Date,
      required: true,
    },
    sourceId: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Primary lookup: all events for a user's application, newest first.
applicationEventSchema.index({
  user: 1,
  application: 1,
  eventDate: -1,
});

// Secondary lookup: events for an application event-date ordered.
applicationEventSchema.index({
  application: 1,
  eventDate: -1,
});

// Gmail idempotency: one derived event per source record per application.
applicationEventSchema.index(
  {
    application: 1,
    source: 1,
    sourceId: 1,
  },
  { unique: true, partialFilterExpression: { sourceId: { $type: "string" } } }
);

export const ApplicationEvent = mongoose.model<IApplicationEvent>(
  "ApplicationEvent",
  applicationEventSchema
);

export default ApplicationEvent;
