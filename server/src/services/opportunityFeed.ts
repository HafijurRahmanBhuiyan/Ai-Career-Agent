import { Types } from "mongoose";
import Job from "../models/Job";
import JobMatch from "../models/JobMatch";
import { Application } from "../models/Application";
import { prepareMatchProfile } from "./jobMatchProfile";
import { prepareMatchJob } from "./jobMatchJob";
import { computeDeterministicMatch } from "./deterministicMatch";
import { classifyApplyCapability } from "./applyCapability";
import { escapeRegex } from "./jobNormalization";
import { AppError } from "../middleware/errorHandler";

export interface OpportunityFilters {
  keywords?: string;
  remote?: string;
  employmentType?: string;
  experienceLevel?: string;
  source?: string;
  page?: number;
  limit?: number;
}

export interface OpportunityItem {
  job: Record<string, unknown>;
  match: Record<string, unknown>;
  applyCapability: {
    capability: string;
    handoffUrl: string | null;
    label: string;
  };
  alreadyApplied: boolean;
  /** Additive: the user's Application status for this job, or null when none. */
  applicationStatus: string | null;
}

export interface OpportunityFeedResult {
  opportunities: OpportunityItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  profileComplete: {
    hasSkills: boolean;
    hasExperience: boolean;
    hasProfile: boolean;
  };
}

const MAX_FEED_LIMIT = 100;
const DEFAULT_FEED_LIMIT = 20;

function escapeRegexInput(str: string): string {
  return escapeRegex(str);
}

/** Load the most recent JobMatch per job for the user (for additive dashboard fields). */
async function loadSavedMatches(userId: string, jobIds: string[]): Promise<Map<string, Record<string, unknown>>> {
  if (jobIds.length === 0) return new Map();

  const validIds = jobIds.filter((id) => Types.ObjectId.isValid(id));
  if (validIds.length === 0) return new Map();

  const docs = await JobMatch.aggregate<{ _id: string; doc: Record<string, unknown> }>([
    { $match: { user: new Types.ObjectId(userId), job: { $in: validIds.map((id) => new Types.ObjectId(id)) } } },
    { $sort: { analyzedAt: -1 } },
    {
      $group: {
        _id: "$job",
        doc: { $first: "$$ROOT" },
      },
    },
  ]);

  const map = new Map<string, Record<string, unknown>>();
  for (const d of docs) {
    map.set(String(d._id), d.doc);
  }
  return map;
}

function toSafeMatch(
  deterministic: {
    score: number;
    matchLevel: string;
    matchingSkills: string[];
    missingSkills: string[];
    matchingTechnologies: string[];
    missingTechnologies: string[];
    experienceMatch: string;
    experienceGap: string;
    locationMatch: string;
    remoteMatch: string;
    employmentTypeMatch: string;
    salaryMatch: string;
    educationMatch: string;
    recommendation: string;
    recommendationReason: string;
    explanation: string[];
  },
  saved?: Record<string, unknown> | null
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    score: deterministic.score,
    matchLevel: deterministic.matchLevel,
    matchingSkills: deterministic.matchingSkills,
    missingSkills: deterministic.missingSkills,
    matchingTechnologies: deterministic.matchingTechnologies,
    missingTechnologies: deterministic.missingTechnologies,
    experienceMatch: deterministic.experienceMatch,
    experienceGap: deterministic.experienceGap,
    locationMatch: deterministic.locationMatch,
    remoteMatch: deterministic.remoteMatch,
    employmentTypeMatch: deterministic.employmentTypeMatch,
    salaryMatch: deterministic.salaryMatch,
    educationMatch: deterministic.educationMatch,
    recommendation: deterministic.recommendation,
    recommendationReason: deterministic.recommendationReason,
    explanation: deterministic.explanation,
  };

  // Additive Phase 2 fields: when a persisted JobMatch exists, expose the
  // decomposed deterministic/AI/final scores, gaps and narrative without
  // removing any previously returned field (backward compatible).
  if (saved) {
    base.deterministicScore = saved.deterministicScore ?? deterministic.score;
    base.aiScore = saved.aiScore ?? null;
    base.finalScore = saved.finalScore ?? deterministic.score;
    base.matchLevel = saved.matchLevel ?? deterministic.matchLevel;
    base.recommendation = saved.recommendation ?? deterministic.recommendation;
    base.summary = saved.summary ?? "";
    base.strengths = saved.strengths ?? [];
    base.weaknesses = saved.weaknesses ?? [];
    base.gaps = saved.gaps ?? [];
    base.analyzedAt = saved.analyzedAt ?? null;
    base.algorithmVersion = saved.algorithmVersion ?? null;
  }

  return base;
}

export async function getOpportunityFeed(
  userId: string,
  filters: OpportunityFilters
): Promise<OpportunityFeedResult> {
  const page = filters.page ?? 1;
  const limit = Math.max(1, Math.min(filters.limit ?? DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { isActive: true };

  if (filters.keywords && filters.keywords.trim()) {
    const k = escapeRegexInput(filters.keywords.trim());
    filter.$or = [
      { title: { $regex: k, $options: "i" } },
      { companyName: { $regex: k, $options: "i" } },
      { description: { $regex: k, $options: "i" } },
      { skills: { $regex: k, $options: "i" } },
    ];
  }

  if (filters.remote && filters.remote !== "any") {
    filter.remoteType = filters.remote;
  }
  if (filters.employmentType) {
    filter.employmentType = filters.employmentType;
  }
  if (filters.experienceLevel) {
    filter.experienceLevel = filters.experienceLevel;
  }
  if (filters.source) {
    filter.source = filters.source;
  }

  const [jobs, total] = await Promise.all([
    Job.find(filter).lean(),
    Job.countDocuments(filter),
  ]);

  const { payload: profilePayload, completeness: profileComplete } =
    await prepareMatchProfile(userId);
  const profileMagnitude = {
    hasSkills: profileComplete.hasSkills,
    hasExperience: profileComplete.hasExperience,
    hasProfile: profileComplete.hasProfile,
  };

  if (jobs.length === 0) {
    return {
      opportunities: [],
      pagination: { page, limit, total, totalPages: 0 },
      profileComplete: profileMagnitude,
    };
  }

  const jobIds = jobs.map((j) => j._id);
  const appliedDocs = await Application.find({
    user: new Types.ObjectId(userId),
    job: { $in: jobIds },
  })
    .select("job status")
    .lean();

  const appliedSet = new Map<string, string>();
  for (const a of appliedDocs) {
    appliedSet.set(String(a.job), a.status);
  }

  const scored = jobs.map((job) => {
    const deterministic = computeDeterministicMatch(
      profilePayload,
      prepareMatchJob(job)
    );
    const capability = classifyApplyCapability(job);
    return {
      job,
      deterministic,
      capability,
      applied: appliedSet.get(String(job._id)) ?? null,
    };
  });

  scored.sort((a, b) => {
    if (b.deterministic.score !== a.deterministic.score) {
      return b.deterministic.score - a.deterministic.score;
    }
    const aDate = (a.job.postedAt || a.job.discoveredAt || new Date(0)).getTime();
    const bDate = (b.job.postedAt || b.job.discoveredAt || new Date(0)).getTime();
    if (bDate !== aDate) return bDate - aDate;
    return String(a.job._id).localeCompare(String(b.job._id));
  });

  const pageItems = scored.slice(skip, skip + limit);

  const savedMatches = await loadSavedMatches(
    userId,
    pageItems.map((item) => String(item.job._id))
  );

  return {
    opportunities: pageItems.map(({ job, deterministic, capability, applied }) => ({
      job: toSafeJob(job),
      match: toSafeMatch(deterministic, savedMatches.get(String(job._id)) ?? null),
      applyCapability: {
        capability: capability.capability,
        handoffUrl: capability.handoffUrl,
        label: capability.label,
      },
      alreadyApplied: applied !== null,
      applicationStatus: applied ?? null,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    profileComplete: profileMagnitude,
  };
}

export async function getOpportunityDetail(
  userId: string,
  jobId: string
): Promise<OpportunityItem> {
  if (!Types.ObjectId.isValid(jobId)) {
    throw new AppError("Job not found", 404);
  }

  const job = await Job.findOne({ _id: jobId, isActive: true }).lean();
  if (!job) {
    throw new AppError("Job not found", 404);
  }

  const profilePayload = (await prepareMatchProfile(userId)).payload;
  const deterministic = computeDeterministicMatch(
    profilePayload,
    prepareMatchJob(job)
  );
  const capability = classifyApplyCapability(job);

  const existing = await Application.findOne({
    user: new Types.ObjectId(userId),
    job: new Types.ObjectId(jobId),
  })
    .select("status")
    .lean();

  const saved = await JobMatch.findOne({
    user: new Types.ObjectId(userId),
    job: new Types.ObjectId(jobId),
  })
    .sort({ analyzedAt: -1 })
    .lean();

  return {
    job: toSafeJob(job),
    match: toSafeMatch(deterministic, saved),
    applyCapability: {
      capability: capability.capability,
      handoffUrl: capability.handoffUrl,
      label: capability.label,
    },
    alreadyApplied: existing !== null,
    applicationStatus: existing ? existing.status : null,
  };
}

function toSafeJob<T extends object>(job: T): Record<string, unknown> {
  const { rawSource, __v, ...safe } = job as Record<string, unknown>;
  void rawSource;
  void __v;
  return safe;
}

