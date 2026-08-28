import mongoose, { Schema, Document, Types } from "mongoose";

export interface IGmailConnection extends Document {
  user: Types.ObjectId;
  googleAccountEmail: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  tokenExpiry: Date;
  scopes: string;
  isActive: boolean;
  connectedAt: Date;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const gmailConnectionSchema = new Schema<IGmailConnection>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    googleAccountEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    encryptedAccessToken: {
      type: String,
      required: true,
      select: false,
    },
    encryptedRefreshToken: {
      type: String,
      required: true,
      select: false,
    },
    tokenExpiry: {
      type: Date,
      required: true,
    },
    scopes: {
      type: String,
      default: "https://www.googleapis.com/auth/gmail.readonly",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const GmailConnection = mongoose.model<IGmailConnection>(
  "GmailConnection",
  gmailConnectionSchema
);

export default GmailConnection;
