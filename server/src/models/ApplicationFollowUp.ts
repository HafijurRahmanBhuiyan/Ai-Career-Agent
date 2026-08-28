import mongoose, { Document, Schema, Types } from "mongoose";

export const FOLLOW_UP_ACTIONS = [
  "recruiter_follow_up",
  "interview_follow_up",
  "application_follow_up",
  "thank_you_note",
  "custom",
] as const;

export type FollowUpAction = (typeof FOLLOW_UP_ACTIONS)[number];

export interface IApplicationFollowUp extends Document {
  user: Types.ObjectId;
  application: Types.ObjectId;
  action: FollowUpAction;
  note?: string;
  dueAt: Date;
  completed: boolean;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const applicationFollowUpSchema = new Schema<IApplicationFollowUp>(
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
    action: {
      type: String,
      enum: FOLLOW_UP_ACTIONS,
      required: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    dueAt: {
      type: Date,
      required: true,
    },
    completed: {
      type: Boolean,
      default: false,
      required: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

applicationFollowUpSchema.index({ user: 1, application: 1, dueAt: 1 });
applicationFollowUpSchema.index({ user: 1, completed: 1, dueAt: 1 });

export const ApplicationFollowUp =
  mongoose.model<IApplicationFollowUp>(
    "ApplicationFollowUp",
    applicationFollowUpSchema
  );
