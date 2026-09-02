import mongoose, { Schema, Document } from "mongoose";

export type RemoteType = "remote" | "hybrid" | "onsite";
export type EmploymentType = "full-time" | "part-time" | "contract" | "internship" | "temporary";
export type ExperienceLevel = "entry" | "junior" | "mid" | "senior" | "lead" | "manager";
export type SalaryPeriod = "yearly" | "monthly" | "hourly" | "contract";
export type ApplyCapability = "external_url" | "supported_api" | "manual_required";

export interface IJob extends Document {
  source: string;
  sourceJobId: string;
  fingerprint?: string;
  title: string;
  companyName: string;
  companyLogo?: string | null;
  description: string;
  location?: string | null;
  locations: string[];
  remoteType: RemoteType;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: SalaryPeriod | null;
  skills: string[];
  technologies: string[];
  jobUrl?: string | null;
  applyUrl?: string | null;
  applyCapability?: ApplyCapability | null;
  postedAt?: Date | null;
  expiresAt?: Date | null;
  discoveredAt: Date;
  lastSeenAt: Date;
  isActive: boolean;
  rawSource: Record<string, unknown>;
  metadata: Record<string, unknown>;
  /**
   * (Phase 2, Step 3) Extracted structured job requirements derived from the
   * description, persisted for reuse/re-caching so matching does not re-parse on
   * every analysis. Additive; never changes existing job ingestion.
   */
  extractedRequirements?: {
    required: string[];
    preferred: string[];
    technologies: string[];
    experience?: { years?: number | null; level?: string | null } | null;
    education?: { degree?: string | null; field?: string | null } | null;
    location?: { cities: string[] } | null;
    remote?: { type?: "remote" | "hybrid" | "onsite" | null } | null;
    employment: string[];
    salary?: { min?: number | null; max?: number | null; currency?: string | null; period?: string | null } | null;
    other: string[];
    unavailable: boolean;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    source: {
      type: String,
      required: true,
    },
    sourceJobId: {
      type: String,
      required: true,
    },
    fingerprint: {
      type: String,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    companyLogo: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      default: null,
    },
    locations: {
      type: [String],
      default: [],
    },
    remoteType: {
      type: String,
      enum: ["remote", "hybrid", "onsite"],
      default: "onsite",
    },
    employmentType: {
      type: String,
      enum: ["full-time", "part-time", "contract", "internship", "temporary"],
      default: "full-time",
    },
    experienceLevel: {
      type: String,
      enum: ["entry", "junior", "mid", "senior", "lead", "manager"],
      default: "mid",
    },
    salaryMin: {
      type: Number,
      default: null,
    },
    salaryMax: {
      type: Number,
      default: null,
    },
    salaryCurrency: {
      type: String,
      default: null,
    },
    salaryPeriod: {
      type: String,
      enum: ["yearly", "monthly", "hourly", "contract"],
      default: null,
    },
    skills: {
      type: [String],
      default: [],
    },
    technologies: {
      type: [String],
      default: [],
    },
    jobUrl: {
      type: String,
      default: null,
    },
    applyUrl: {
      type: String,
      default: null,
    },
    applyCapability: {
      type: String,
      enum: ["external_url", "supported_api", "manual_required"],
      default: null,
    },
    postedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    discoveredAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    rawSource: {
      type: Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    extractedRequirements: {
      type: new Schema(
        {
          required: { type: [String], default: [] },
          preferred: { type: [String], default: [] },
          technologies: { type: [String], default: [] },
          experience: {
            type: new Schema(
              {
                years: { type: Number, default: null },
                level: { type: String, default: null },
              },
              { _id: false }
            ),
            default: null,
          },
          education: {
            type: new Schema(
              {
                degree: { type: String, default: null },
                field: { type: String, default: null },
              },
              { _id: false }
            ),
            default: null,
          },
          location: {
            type: new Schema(
              { cities: { type: [String], default: [] } },
              { _id: false }
            ),
            default: null,
          },
          remote: {
            type: new Schema(
              { type: { type: String, enum: ["remote", "hybrid", "onsite"], default: null } },
              { _id: false }
            ),
            default: null,
          },
          employment: { type: [String], default: [] },
          salary: {
            type: new Schema(
              {
                min: { type: Number, default: null },
                max: { type: Number, default: null },
                currency: { type: String, default: null },
                period: { type: String, default: null },
              },
              { _id: false }
            ),
            default: null,
          },
          other: { type: [String], default: [] },
          unavailable: { type: Boolean, default: true },
        },
        { _id: false }
      ),
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

jobSchema.index({ source: 1, sourceJobId: 1 }, { unique: true });
jobSchema.index({ fingerprint: 1 }, { sparse: true });
jobSchema.index({ title: 1 });
jobSchema.index({ companyName: 1 });
jobSchema.index({ location: 1 });
jobSchema.index({ remoteType: 1 });
jobSchema.index({ employmentType: 1 });
jobSchema.index({ experienceLevel: 1 });
jobSchema.index({ postedAt: -1 });
jobSchema.index({ discoveredAt: -1 });
jobSchema.index({ isActive: 1 });

const Job = mongoose.model<IJob>("Job", jobSchema);

export default Job;
