import mongoose, { Schema, Document } from "mongoose";

export type LinkedInDraftStatus =
  | "draft"
  | "reviewed"
  | "approved"
  | "publishing"
  | "published"
  | "publish_failed"
  | "archived";

export interface ILinkedInDraft extends Document {
  user: mongoose.Types.ObjectId;
  evidence: mongoose.Types.ObjectId;
  repository?: mongoose.Types.ObjectId | null;
  hook: string;
  body: string;
  hashtags: string[];
  status: LinkedInDraftStatus;
  publishedAt?: Date | null;
  linkedinPostUrn?: string | null;
  linkedinPostUrl?: string | null;
  lastPublishAttemptAt?: Date | null;
  publishErrorCode?: string | null;
  publishErrorMessageSafe?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const linkedInDraftSchema = new Schema<ILinkedInDraft>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    evidence: {
      type: Schema.Types.ObjectId,
      ref: "ProfessionalEvidence",
      required: true,
    },
    repository: {
      type: Schema.Types.ObjectId,
      ref: "GitHubRepository",
      default: null,
    },
    hook: {
      type: String,
      default: "",
      trim: true,
      maxlength: [300, "Hook must be 300 characters or less"],
    },
    body: {
      type: String,
      default: "",
      trim: true,
      maxlength: [3000, "Body must be 3000 characters or less"],
    },
    hashtags: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: [
        "draft",
        "reviewed",
        "approved",
        "publishing",
        "published",
        "publish_failed",
        "archived",
      ],
      default: "draft",
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    linkedinPostUrn: {
      type: String,
      default: null,
      trim: true,
    },
    linkedinPostUrl: {
      type: String,
      default: null,
      trim: true,
    },
    lastPublishAttemptAt: {
      type: Date,
      default: null,
    },
    publishErrorCode: {
      type: String,
      default: null,
      trim: true,
    },
    publishErrorMessageSafe: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

linkedInDraftSchema.index({ user: 1, evidence: 1 });
linkedInDraftSchema.index({ user: 1, status: 1 });

const LinkedInDraft = mongoose.model<ILinkedInDraft>(
  "LinkedInDraft",
  linkedInDraftSchema
);

export default LinkedInDraft;
