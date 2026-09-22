import mongoose, { Schema, Document } from "mongoose";

export interface IGitHubConnection extends Document {
  user: mongoose.Types.ObjectId;
  githubUserId: number;
  username: string;
  profileUrl: string;
  avatarUrl: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  scope: string;
  connectedAt: Date;
  updatedAt: Date;
}

const gitHubConnectionSchema = new Schema<IGitHubConnection>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    githubUserId: {
      type: Number,
      required: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    profileUrl: {
      type: String,
      required: true,
    },
    avatarUrl: {
      type: String,
      required: true,
    },
    accessToken: {
      type: String,
      required: true,
      select: false,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    accessTokenExpiresAt: {
      type: Date,
      default: null,
    },
    refreshTokenExpiresAt: {
      type: Date,
      default: null,
    },
    scope: {
      type: String,
      default: "read:user repo",
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const GitHubConnection = mongoose.model<IGitHubConnection>(
  "GitHubConnection",
  gitHubConnectionSchema
);

export default GitHubConnection;
