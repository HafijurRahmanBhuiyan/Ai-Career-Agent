import mongoose, { Schema, Document } from "mongoose";

export interface IGitHubRepository extends Document {
  user: mongoose.Types.ObjectId;
  githubRepositoryId: number;
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  homepage: string | null;
  private: boolean;
  fork: boolean;
  defaultBranch: string;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  size: number;
  createdAtGithub: Date;
  updatedAtGithub: Date;
  pushedAtGithub: Date;
  importedAt: Date;
  approvedForProfessionalUse: boolean;
  approvedAt: Date | null;
  updatedAt: Date;
}

const gitHubRepositorySchema = new Schema<IGitHubRepository>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    githubRepositoryId: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: null,
    },
    htmlUrl: {
      type: String,
      required: true,
    },
    homepage: {
      type: String,
      default: null,
    },
    private: {
      type: Boolean,
      default: false,
    },
    fork: {
      type: Boolean,
      default: false,
    },
    defaultBranch: {
      type: String,
      default: "main",
    },
    language: {
      type: String,
      default: null,
    },
    topics: {
      type: [String],
      default: [],
    },
    stars: {
      type: Number,
      default: 0,
    },
    forks: {
      type: Number,
      default: 0,
    },
    size: {
      type: Number,
      default: 0,
    },
    createdAtGithub: {
      type: Date,
      required: true,
    },
    updatedAtGithub: {
      type: Date,
      required: true,
    },
    pushedAtGithub: {
      type: Date,
      required: true,
    },
    importedAt: {
      type: Date,
      default: Date.now,
    },
    // Explicit user approval that this repository may be used professionally
    // (analyzed, published about, shown to employers). Defaults to false; the
    // user must explicitly opt a repository into the professional-content
    // workflow. No repository is ever analyzed/targeted for publishing without
    // this explicit approval.
    approvedForProfessionalUse: {
      type: Boolean,
      default: false,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

gitHubRepositorySchema.index({ user: 1, githubRepositoryId: 1 }, { unique: true });

const GitHubRepositoryModel = mongoose.model<IGitHubRepository>(
  "GitHubRepository",
  gitHubRepositorySchema
);

export default GitHubRepositoryModel;
