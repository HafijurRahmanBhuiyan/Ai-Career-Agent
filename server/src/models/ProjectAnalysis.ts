import mongoose, { Schema, Document } from "mongoose";

export interface IProjectAnalysis extends Document {
  user: mongoose.Types.ObjectId;
  githubRepository: mongoose.Types.ObjectId;
  projectSummary: string;
  problemStatement: string;
  keyFeatures: string[];
  technologies: string[];
  programmingLanguages: string[];
  frameworks: string[];
  databases: string[];
  tools: string[];
  cloudServices: string[];
  architecture: string;
  developmentHighlights: string[];
  skillsDemonstrated: string[];
  difficultyLevel: "Beginner" | "Intermediate" | "Advanced";
  developerRole: string;
  resumeDescription: string;
  linkedinDescription: string;
  suggestedTags: string[];
  aiModel: string;
  promptVersion: string;
  analyzedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const projectAnalysisSchema = new Schema<IProjectAnalysis>(
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
    projectSummary: {
      type: String,
      required: true,
    },
    problemStatement: {
      type: String,
      required: true,
    },
    keyFeatures: {
      type: [String],
      default: [],
    },
    technologies: {
      type: [String],
      default: [],
    },
    programmingLanguages: {
      type: [String],
      default: [],
    },
    frameworks: {
      type: [String],
      default: [],
    },
    databases: {
      type: [String],
      default: [],
    },
    tools: {
      type: [String],
      default: [],
    },
    cloudServices: {
      type: [String],
      default: [],
    },
    architecture: {
      type: String,
      default: "",
    },
    developmentHighlights: {
      type: [String],
      default: [],
    },
    skillsDemonstrated: {
      type: [String],
      default: [],
    },
    difficultyLevel: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced"],
      required: true,
    },
    developerRole: {
      type: String,
      required: true,
    },
    resumeDescription: {
      type: String,
      required: true,
    },
    linkedinDescription: {
      type: String,
      required: true,
    },
    suggestedTags: {
      type: [String],
      default: [],
    },
    aiModel: {
      type: String,
      required: true,
    },
    promptVersion: {
      type: String,
      required: true,
    },
    analyzedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

projectAnalysisSchema.index({ user: 1, githubRepository: 1 });
projectAnalysisSchema.index({ user: 1, githubRepository: 1, analyzedAt: -1 });

const ProjectAnalysis = mongoose.model<IProjectAnalysis>(
  "ProjectAnalysis",
  projectAnalysisSchema
);

export default ProjectAnalysis;
