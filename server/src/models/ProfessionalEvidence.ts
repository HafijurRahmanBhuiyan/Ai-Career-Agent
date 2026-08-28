import mongoose, { Schema, Document } from "mongoose";

export interface IProfessionalEvidence extends Document {
  user: mongoose.Types.ObjectId;
  githubRepository: mongoose.Types.ObjectId;
  sourceProjectAnalysis: mongoose.Types.ObjectId | null;
  projectName: string;
  professionalSummary: string;
  problemSolved: string;
  contributionEvidence: string;
  technicalSkills: string[];
  architecturePractices: string[];
  measurableImpact: string;
  technologies: string[];
  proposedTalkingPoints: string[];
  suggestedPostAngles: string[];
  evidenceReferences: string[];
  roleRelevantKeywords: string[];
  projectDomain: string;
  senioritySignals: string[];
  status: "ready" | "needs_evidence";
  createdAt: Date;
  updatedAt: Date;
}

const professionalEvidenceSchema = new Schema<IProfessionalEvidence>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    githubRepository: {
      type: Schema.Types.ObjectId,
      ref: "GitHubRepository",
      required: true,
    },
    sourceProjectAnalysis: {
      type: Schema.Types.ObjectId,
      ref: "ProjectAnalysis",
      default: null,
    },
    projectName: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, "Project name must be 200 characters or less"],
    },
    professionalSummary: {
      type: String,
      default: "",
      trim: true,
      maxlength: [5000, "Professional summary must be 5000 characters or less"],
    },
    problemSolved: {
      type: String,
      default: "",
      trim: true,
      maxlength: [5000, "Problem solved must be 5000 characters or less"],
    },
    contributionEvidence: {
      type: String,
      default: "",
      trim: true,
      maxlength: [5000, "Contribution evidence must be 5000 characters or less"],
    },
    technicalSkills: {
      type: [String],
      default: [],
    },
    architecturePractices: {
      type: [String],
      default: [],
    },
    measurableImpact: {
      type: String,
      default: "",
      trim: true,
      maxlength: [3000, "Measurable impact must be 3000 characters or less"],
    },
    technologies: {
      type: [String],
      default: [],
    },
    proposedTalkingPoints: {
      type: [String],
      default: [],
    },
    suggestedPostAngles: {
      type: [String],
      default: [],
    },
    evidenceReferences: {
      type: [String],
      default: [],
    },
    roleRelevantKeywords: {
      type: [String],
      default: [],
    },
    projectDomain: {
      type: String,
      default: "",
      trim: true,
      maxlength: [200, "Project domain must be 200 characters or less"],
    },
    senioritySignals: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["ready", "needs_evidence"],
      default: "needs_evidence",
    },
  },
  {
    timestamps: true,
  }
);

professionalEvidenceSchema.index({ user: 1, githubRepository: 1 }, { unique: true });

const ProfessionalEvidence = mongoose.model<IProfessionalEvidence>(
  "ProfessionalEvidence",
  professionalEvidenceSchema
);

export default ProfessionalEvidence;
