import mongoose, { Schema, Document, Types } from "mongoose";

export interface ILinkedInConnection extends Document {
  user: Types.ObjectId;
  linkedinMemberId: string;
  linkedinProfileUrn: string;
  displayName?: string | null;
  encryptedAccessToken: string;
  encryptedRefreshToken?: string | null;
  tokenExpiry?: Date | null;
  scopes: string;
  isActive: boolean;
  connectedAt: Date;
  lastUsedAt?: Date | null;
  lastValidatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const linkedInConnectionSchema = new Schema<ILinkedInConnection>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    linkedinMemberId: {
      type: String,
      required: true,
      trim: true,
    },
    linkedinProfileUrn: {
      type: String,
      required: true,
      trim: true,
    },
    displayName: {
      type: String,
      default: null,
      trim: true,
    },
    encryptedAccessToken: {
      type: String,
      required: true,
      select: false,
    },
    encryptedRefreshToken: {
      type: String,
      default: null,
      select: false,
    },
    tokenExpiry: {
      type: Date,
      default: null,
    },
    scopes: {
      type: String,
      default: "openid profile email w_member_social",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    lastValidatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const LinkedInConnection = mongoose.model<ILinkedInConnection>(
  "LinkedInConnection",
  linkedInConnectionSchema
);

export default LinkedInConnection;
