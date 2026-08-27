import mongoose, { Document, Schema, Types } from "mongoose";

export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface IApplication extends Document {
  user: Types.ObjectId;
  job: Types.ObjectId;
  status: ApplicationStatus;
  appliedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const applicationSchema = new Schema<IApplication>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    job: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: APPLICATION_STATUSES,
      default: "saved",
      required: true,
    },

    appliedAt: {
      type: Date,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
  },
  {
    timestamps: true,
  }
);

// A user can have only one application record for a specific job.
applicationSchema.index(
  { user: 1, job: 1 },
  { unique: true }
);

// Useful for listing applications by status.
applicationSchema.index({
  user: 1,
  status: 1,
});

// Useful for sorting recent applications.
applicationSchema.index({
  user: 1,
  updatedAt: -1,
});

export const Application = mongoose.model<IApplication>(
  "Application",
  applicationSchema
);