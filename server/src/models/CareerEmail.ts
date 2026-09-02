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

// Structured career-event intelligence (Phase 2, Step 6): a richer, additive
// summary of a concrete career event detected in a single Gmail message. It
// does not replace the category/status fields; it complements them with
// interview details, deadlines, actions and confidence, all of which stay
// optional and are never fabricated.
export const CAREER_EVENT_TYPES = [
  "interview",
  "screening",
  "assessment",
  "shortlist",
  "offer",
  "rejection",
  "recruiter_contact",
  "application_update",
] as const;

export type CareerEventType = (typeof CAREER_EVENT_TYPES)[number];

export interface ICareerEvent {
  type?: CareerEventType;
  confidence?: number | null;
  title?: string | null;
  company?: string | null;
  role?: string | null;
  scheduledAt?: Date | null;
  timezone?: string | null;
  durationMinutes?: number | null;
  interviewerName?: string | null;
  interviewerEmail?: string | null;
  meetingUrl?: string | null;
  meetingPlatform?: string | null;
  location?: string | null;
  phone?: string | null;
  deadlineAt?: Date | null;
  deadlineTimezone?: string | null;
  actionRequired?: boolean | null;
  actionText?: string | null;
  candidateResponseRequired?: boolean | null;
  evidence?: string | null;
  detectedAt?: Date;
}

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
  // Manually applied from this email (distinct from automatic high-confidence
  // application in careerStatusTransitions). Additive bookkeeping for the
  // manual status-application flow; never duplicates the automatic signal.
  manualStatusApplied?: boolean;
  manualStatusAppliedAt?: Date;
  manualStatusReason?: string;
  // Phase 2 Step 6: structured career-event intelligence for this message.
  // Additive and optional; never fabricated and never merged with category.
  careerEvent?: ICareerEvent;
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
    manualStatusApplied: {
      type: Boolean,
      default: false,
    },
    manualStatusAppliedAt: {
      type: Date,
      default: null,
    },
    manualStatusReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    careerEvent: {
      type: new Schema(
        {
          type: { type: String, enum: CAREER_EVENT_TYPES, default: null },
          confidence: { type: Number, min: 0, max: 1, default: null },
          title: { type: String, trim: true, maxlength: 500, default: null },
          company: { type: String, trim: true, maxlength: 300, default: null },
          role: { type: String, trim: true, maxlength: 300, default: null },
          scheduledAt: { type: Date, default: null },
          timezone: { type: String, trim: true, maxlength: 120, default: null },
          durationMinutes: { type: Number, min: 0, max: 10080, default: null },
          interviewerName: { type: String, trim: true, maxlength: 300, default: null },
          interviewerEmail: { type: String, trim: true, maxlength: 300, default: null },
          meetingUrl: { type: String, trim: true, maxlength: 1000, default: null },
          meetingPlatform: { type: String, trim: true, maxlength: 120, default: null },
          location: { type: String, trim: true, maxlength: 500, default: null },
          phone: { type: String, trim: true, maxlength: 100, default: null },
          deadlineAt: { type: Date, default: null },
          deadlineTimezone: { type: String, trim: true, maxlength: 120, default: null },
          actionRequired: { type: Boolean, default: null },
          actionText: { type: String, trim: true, maxlength: 500, default: null },
          candidateResponseRequired: { type: Boolean, default: null },
          evidence: { type: String, trim: true, maxlength: 500, default: null },
          detectedAt: { type: Date, default: null },
        },
        { _id: false }
      ),
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
