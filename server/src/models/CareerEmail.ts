import mongoose, { Schema, Document, Types } from "mongoose";
import { APPLICATION_STATUSES } from "./Application";

export const CAREER_EMAIL_CATEGORIES = [
  "recruiter_outreach",
  "application_received",
  "application_update",
  "interview_invitation",
  "interview_reschedule",
  "assessment",
  "rejection",
  "offer",
  "follow_up",
  "networking",
  "unrelated",
] as const;

export type CareerEmailCategory = (typeof CAREER_EMAIL_CATEGORIES)[number];

// Hiring-stage signals Gmail career-status detection can derive and auto-apply.
// Excludes "applied" and "withdrawn" on purpose: "applied" is only ever set by
// the explicit execution flow, and "withdrawn" is never changed automatically.
export const DETECTED_CAREER_STATUSES = [
  "screening",
  "interview",
  "offer",
  "rejected",
] as const;

export type DetectedCareerStatus = (typeof DETECTED_CAREER_STATUSES)[number];

export const CAREER_EMAIL_CLASSIFICATION_STATUSES = [
  "classified",
  "failed",
] as const;

export type CareerEmailClassificationStatus =
  (typeof CAREER_EMAIL_CLASSIFICATION_STATUSES)[number];

export interface InterviewInfo {
  type?: string | null;
  scheduledAt?: Date | null;
  interviewer?: string | null;
  meetingUrl?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface ICareerEmail extends Document {
  user: Types.ObjectId;
  gmailMessageId: string;
  threadId?: string;
  from?: string;
  to?: string;
  subject?: string;
  receivedAt?: Date;
  snippet?: string;
  category?: CareerEmailCategory;
  confidence?: number;
  summary?: string;
  companyName?: string;
  jobTitle?: string;
  suggestedApplicationStatus?: (typeof APPLICATION_STATUSES)[number];
  interviewDate?: Date;
  interviewType?: string;
  interview?: InterviewInfo;
  actionRequired?: boolean;
  actionDeadline?: Date;
  extractedApplicationHints?: Record<string, unknown>;
  application?: Types.ObjectId;
  classificationStatus?: CareerEmailClassificationStatus;
  classifiedAt?: Date;
  rawMetadata?: Record<string, unknown>;
  // Phase 2 Step 5: hiring-stage detection from Gmail. "careerStatus" is the
  // derived stage (screening/interview/offer/rejected); it is stored alongside
  // the original AI classification and may advance the linked application only
  // when the profile toggle is on, confidence is high, and the transition is
  // explicitly allowed.
  careerStatus?: DetectedCareerStatus | null;
  careerStatusConfidence?: number | null;
  careerStatusDetectedAt?: Date;
  autoStatusApplied?: boolean;
  autoStatusReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const careerEmailSchema = new Schema<ICareerEmail>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    gmailMessageId: {
      type: String,
      required: true,
    },
    threadId: {
      type: String,
    },
    from: {
      type: String,
      trim: true,
    },
    to: {
      type: String,
      trim: true,
    },
    subject: {
      type: String,
      trim: true,
    },
    receivedAt: {
      type: Date,
    },
    snippet: {
      type: String,
    },
    category: {
      type: String,
      enum: CAREER_EMAIL_CATEGORIES,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
    },
    summary: {
      type: String,
    },
    companyName: {
      type: String,
      trim: true,
    },
    jobTitle: {
      type: String,
      trim: true,
    },
    suggestedApplicationStatus: {
      type: String,
      enum: APPLICATION_STATUSES,
      default: null,
    },
    interviewDate: {
      type: Date,
    },
    interviewType: {
      type: String,
      trim: true,
    },
    interview: {
      type: new Schema(
        {
          type: { type: String, trim: true, default: null },
          scheduledAt: { type: Date, default: null },
          interviewer: { type: String, trim: true, default: null },
          meetingUrl: { type: String, trim: true, default: null },
          location: { type: String, trim: true, default: null },
          notes: { type: String, trim: true, default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    actionRequired: {
      type: Boolean,
      default: null,
    },
    actionDeadline: {
      type: Date,
    },
    extractedApplicationHints: {
      type: Schema.Types.Mixed,
      default: {},
    },
    application: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      default: null,
    },
    classificationStatus: {
      type: String,
      enum: CAREER_EMAIL_CLASSIFICATION_STATUSES,
    },
    classifiedAt: {
      type: Date,
    },
    rawMetadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    careerStatus: {
      type: String,
      enum: DETECTED_CAREER_STATUSES,
      default: null,
    },
    careerStatusConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    careerStatusDetectedAt: {
      type: Date,
      default: null,
    },
    autoStatusApplied: {
      type: Boolean,
      default: false,
    },
    autoStatusReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// One user can only have one intelligence record per Gmail message.
careerEmailSchema.index(
  { user: 1, gmailMessageId: 1 },
  { unique: true }
);

careerEmailSchema.index({ user: 1, category: 1 });
careerEmailSchema.index({ user: 1, suggestedApplicationStatus: 1 });
careerEmailSchema.index({ user: 1, careerStatus: 1 });
careerEmailSchema.index({ user: 1, receivedAt: -1 });

export const CareerEmail = mongoose.model<ICareerEmail>(
  "CareerEmail",
  careerEmailSchema
);
