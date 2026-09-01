import mongoose, { Schema, Document } from "mongoose";
import { ResumeDerivedEvidence } from "../services/resumeTypes";

export interface IResume extends Document {
  user: mongoose.Types.ObjectId;
  title: string;
  fileName: string;
  fileUrl?: string;
  /** (Phase 2, Step 3) GridFS file id of the uploaded document. */
  fileId?: mongoose.Types.ObjectId;
  mimeType?: string;
  /**
   * (Phase 2, Step 3) Bounded extracted text + extraction status.
   * Server-side only; never exposed via public APIs or sent to the matcher.
   */
  content?: {
    text: string;
    length: number;
    truncated: boolean;
    format: string;
    extractionStatus: string;
    extractedAt?: Date;
  };
  /** (Phase 2, Step 3) Validated structured resume-derived career evidence. */
  evidence?: ResumeDerivedEvidence;
  version: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const resumeSchema = new Schema<IResume>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Resume title is required"],
      trim: true,
      maxlength: [200, "Title must be 200 characters or less"],
    },
    fileName: {
      type: String,
      required: [true, "File name is required"],
      trim: true,
      maxlength: [255, "File name must be 255 characters or less"],
    },
    fileUrl: {
      type: String,
      trim: true,
    },
    fileId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    mimeType: {
      type: String,
      trim: true,
      maxlength: [120, "MIME type must be 120 characters or less"],
      default: null,
    },
    content: {
      type: new Schema(
        {
          text: { type: String, default: "", maxlength: 20050 },
          length: { type: Number, default: 0 },
          truncated: { type: Boolean, default: false },
          format: { type: String, default: "unknown" },
          extractionStatus: { type: String, default: "none" },
          extractedAt: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    evidence: {
      type: new Schema(
        {
          summary: { type: String, default: null },
          skills: { type: [String], default: [] },
          technologies: { type: [String], default: [] },
          roles: { type: [String], default: [] },
          employers: { type: [String], default: [] },
          yearsExperience: { type: Number, default: null },
          projects: { type: [String], default: [] },
          achievements: { type: [String], default: [] },
          education: {
            type: [
              new Schema(
                {
                  degree: { type: String, default: null },
                  institution: { type: String, default: null },
                  field: { type: String, default: null },
                },
                { _id: false }
              ),
            ],
            default: [],
          },
          certifications: { type: [String], default: [] },
          domains: { type: [String], default: [] },
          extraction: {
            type: new Schema(
              {
                status: { type: String, default: "none" },
                source: { type: String, default: "deterministic" },
                extractedAt: { type: String, default: null },
              },
              { _id: false }
            ),
            default: null,
          },
        },
        { _id: false }
      ),
      default: null,
    },
    version: {
      type: Number,
      default: 1,
      min: [1, "Version must be at least 1"],
    },
    isActive: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Resume = mongoose.model<IResume>("Resume", resumeSchema);

export default Resume;
