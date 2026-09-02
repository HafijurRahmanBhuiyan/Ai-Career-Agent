import mongoose, { Schema, Document } from "mongoose";

export type MatchLevel =
  | "strong_match"
  | "good_match"
  | "partial_match"
  | "weak_match";

export type MatchRecommendation = "apply" | "maybe" | "skip";

export interface IJobMatch extends Document {
  user: mongoose.Types.ObjectId;
  job: mongoose.Types.ObjectId;
  aiModel: string;
  promptVersion: string;
  /** Effective final score (0–100): 0.6*ai + 0.4*deterministic when AI present, else deterministic. */
  score: number;
  /**
   * (Phase 2, Step 1) Decomposed scores. Deterministic is always computed;
   * aiScore is null when no AI analysis succeeded. finalScore is the effective
   * displayed score and equals `score`. All are finite and clamped to 0–100.
   */
  deterministicScore: number;
  aiScore: number | null;
  finalScore: number;
  matchLevel: MatchLevel;
  summary: string;
  matchingSkills: string[];
  missingSkills: string[];
  matchingTechnologies: string[];
  missingTechnologies: string[];
  experienceMatch: string;
  experienceGap: string;
  educationMatch: string;
  educationGap: string;
  locationMatch: string;
  remoteMatch: string;
  employmentTypeMatch: string;
  salaryMatch: string;
  strengths: string[];
  weaknesses: string[];
  /** (Phase 2, Step 1) Structured actionable gaps (AI-derived, additive). */
  gaps: string[];
  recommendation: MatchRecommendation;
  recommendationReason: string;
  /** (Phase 2, Step 1) Lightweight context hashes for cache invalidation. */
  profileVersion: string | null;
  jobVersion: string | null;
  /** (Phase 2, Step 1) Matching algorithm version (bump to invalidate old matches). */
  algorithmVersion: string | null;
  analyzedAt: Date;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const jobMatchSchema = new Schema<IJobMatch>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    job: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    aiModel: {
      type: String,
      required: true,
    },
    promptVersion: {
      type: String,
      required: true,
    },
    score: {
      type: Number,
      required: true,
      min: [0, "Score must be at least 0"],
      max: [100, "Score must be at most 100"],
    },
    deterministicScore: {
      type: Number,
      default: null,
      min: [0, "Score must be at least 0"],
      max: [100, "Score must be at most 100"],
    },
    aiScore: {
      type: Number,
      default: null,
      min: [0, "Score must be at least 0"],
      max: [100, "Score must be at most 100"],
    },
    finalScore: {
      type: Number,
      default: null,
      min: [0, "Score must be at least 0"],
      max: [100, "Score must be at most 100"],
    },
    matchLevel: {
      type: String,
      enum: ["strong_match", "good_match", "partial_match", "weak_match"],
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    matchingSkills: {
      type: [String],
      default: [],
    },
    missingSkills: {
      type: [String],
      default: [],
    },
    matchingTechnologies: {
      type: [String],
      default: [],
    },
    missingTechnologies: {
      type: [String],
      default: [],
    },
    experienceMatch: {
      type: String,
      default: "",
    },
    experienceGap: {
      type: String,
      default: "",
    },
    educationMatch: {
      type: String,
      default: "",
    },
    educationGap: {
      type: String,
      default: "",
    },
    locationMatch: {
      type: String,
      default: "",
    },
    remoteMatch: {
      type: String,
      default: "",
    },
    employmentTypeMatch: {
      type: String,
      default: "",
    },
    salaryMatch: {
      type: String,
      default: "",
    },
    strengths: {
      type: [String],
      default: [],
    },
    weaknesses: {
      type: [String],
      default: [],
    },
    gaps: {
      type: [String],
      default: [],
    },
    recommendation: {
      type: String,
      default: "maybe",
    },
    recommendationReason: {
      type: String,
      default: "",
    },
    analyzedAt: {
      type: Date,
      default: Date.now,
    },
    profileVersion: {
      type: String,
      default: null,
    },
    jobVersion: {
      type: String,
      default: null,
    },
    algorithmVersion: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

jobMatchSchema.index({ user: 1, job: 1 });
jobMatchSchema.index({ user: 1, score: -1 });
jobMatchSchema.index({ user: 1, analyzedAt: -1 });
jobMatchSchema.index({ user: 1, matchLevel: 1 });

const JobMatch = mongoose.model<IJobMatch>("JobMatch", jobMatchSchema);

export default JobMatch;
