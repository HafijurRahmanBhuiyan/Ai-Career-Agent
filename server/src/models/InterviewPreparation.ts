import mongoose, { Document, Schema, Types } from "mongoose";

export const CHECKLIST_KEYS = [
  "resume_reviewed",
  "job_description_reviewed",
  "company_researched",
  "star_stories_prepared",
  "technical_topics_prepared",
  "behavioral_topics_prepared",
  "interviewer_questions_prepared",
] as const;

export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export interface IChecklistItem {
  key: ChecklistKey;
  label: string;
  completed: boolean;
  completedAt?: Date | null;
}

export interface IInterviewPreparation extends Document {
  user: Types.ObjectId;
  application: Types.ObjectId;
  notes?: string;
  goals?: string[];
  talkingPoints?: string[];
  questionsToAsk?: string[];
  companyResearchNotes?: string;
  rolePreparationNotes?: string;
  checklist: IChecklistItem[];
  createdAt: Date;
  updatedAt: Date;
}

const checklistItemSchema = new Schema<IChecklistItem>(
  {
    key: {
      type: String,
      enum: CHECKLIST_KEYS,
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
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
  { _id: false }
);

const interviewPreparationSchema = new Schema<IInterviewPreparation>(
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
    notes: {
      type: String,
      trim: true,
      maxlength: 10000,
    },
    goals: {
      type: [String],
      default: [],
    },
    talkingPoints: {
      type: [String],
      default: [],
    },
    questionsToAsk: {
      type: [String],
      default: [],
    },
    companyResearchNotes: {
      type: String,
      trim: true,
      maxlength: 10000,
    },
    rolePreparationNotes: {
      type: String,
      trim: true,
      maxlength: 10000,
    },
    checklist: {
      type: [checklistItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// One preparation record per application per user.
interviewPreparationSchema.index(
  { user: 1, application: 1 },
  { unique: true }
);

export const InterviewPreparation =
  mongoose.model<IInterviewPreparation>(
    "InterviewPreparation",
    interviewPreparationSchema
  );
