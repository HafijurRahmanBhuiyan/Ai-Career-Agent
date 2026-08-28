import mongoose, { Schema, Document, Types } from "mongoose";

export interface IApplicationSummary extends Document {
  user: Types.ObjectId;
  application: Types.ObjectId;
  aiModel: string;
  promptVersion: string;
  stateHash: string;
  summary: string;
  currentSituation: string;
  strengths: string[];
  risks: string[];
  nextActions: string[];
  analyzedAt: Date;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const applicationSummarySchema = new Schema<IApplicationSummary>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    application: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    aiModel: {
      type: String,
      required: true,
    },
    promptVersion: {
      type: String,
      required: true,
    },
    stateHash: {
      type: String,
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    currentSituation: {
      type: String,
      default: "",
    },
    strengths: {
      type: [String],
      default: [],
    },
    risks: {
      type: [String],
      default: [],
    },
    nextActions: {
      type: [String],
      default: [],
    },
    analyzedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

applicationSummarySchema.index({ user: 1, application: 1 });
applicationSummarySchema.index({ application: 1, analyzedAt: -1 });

export const ApplicationSummary = mongoose.model<IApplicationSummary>(
  "ApplicationSummary",
  applicationSummarySchema
);

export default ApplicationSummary;
