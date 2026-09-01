import { Types } from "mongoose";
import Job from "../models/Job";
import JobMatch, {
  IJobMatch,
  MatchRecommendation,
  MatchLevel,
} from "../models/JobMatch";
import { ClaudeService } from "../integrations/claude/claude.service";
import { getModel } from "../integrations/claude/claudeClient";
import { JOB_MATCH_PROMPT_VERSION } from "../integrations/claude/jobMatchPrompts";
import {
  validateJobMatchAIOutput,
  matchLevelFromScore,
  clampMatchScore,
  deriveRecommendationFromScore,
  JobMatchAIOutput,
} from "../validators/jobMatch";
import { prepareMatchProfile } from "./jobMatchProfile";
import { prepareMatchJob } from "./jobMatchJob";
import { computeDeterministicMatch, DeterministicMatchResult } from "./deterministicMatch";
import {
  JobMatchProfilePayload,
  JobMatchJobPayload,
} from "./jobMatchTypes";
import { AppError } from "../middleware/errorHandler";

const claudeService = new ClaudeService();

export const JOB_MATCH_CACHE_HOURS_DEFAULT = 24 * 7;

/**
 * (Phase 2, Step 1) Algorithm/prompt-context version. Bumping this invalidates
 * previously cached matches whose algorithmVersion differs, so stale AI results
 * are not reused after a matching-algorithm change.
 */
export const JOB_MATCH_ALGORITHM_VERSION = "v3";

/**
 * (Phase 2, Step 1) Final score formula weighting. Documented and deterministic:
 *   finalScore = aiScore present ? clamp(round(0.6*ai + 0.4*deterministic)) : deterministic
 */
export const FINAL_SCORE_AI_WEIGHT = 0.6;
export const FINAL_SCORE_DETERMINISTIC_WEIGHT = 0.4;

export function getJobMatchCacheHours(): number {
  const parsed = parseInt(
    process.env.JOB_MATCH_CACHE_HOURS || `${JOB_MATCH_CACHE_HOURS_DEFAULT}`,
    10
  );
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : JOB_MATCH_CACHE_HOURS_DEFAULT;
}

export interface JobMatchListQuery {
  page?: number;
  limit?: number;
  minScore?: number;
  matchLevel?: string;
  sort?: string;
}

export interface ListMatchesResult {
  matches: IJobMatch[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function stableHash(value: unknown): string {
  let hash = 0;
  const str = JSON.stringify(value ?? {});
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function computeProfileVersion(profilePayload: JobMatchProfilePayload): string {
  return stableHash(profilePayload);
}

export function computeJobVersion(jobPayload: JobMatchJobPayload): string {
  return stableHash(jobPayload);
}

export function combineScores(
  deterministicScore: number,
  aiScore: number | null | undefined
): { aiScore: number | null; finalScore: number } {
  const det = clampMatchScore(deterministicScore, 0);
  const ai = aiScore == null ? null : clampMatchScore(aiScore, det);

  let finalScore = det;
  if (ai != null) {
    const raw = FINAL_SCORE_AI_WEIGHT * ai + FINAL_SCORE_DETERMINISTIC_WEIGHT * det;
    finalScore = clampMatchScore(raw, det);
  }
  return { aiScore: ai, finalScore };
}

async function verifyJobExists(jobId: string) {
  const job = await Job.findOne({ _id: jobId, isActive: true }).lean();
  if (!job) {
    throw new AppError("Job not found", 404);
  }
  return job;
}

/** Run AI job-match analysis with cross-provider fallback. Returns null (never throws) so callers can fall back to deterministic. */
async function analyzeJobWithFallback(
  profilePayload: JobMatchProfilePayload,
  jobPayload: JobMatchJobPayload
): Promise<JobMatchAIOutput | null> {
  try {
    const rawResult = await claudeService.analyzeJobMatchFallback(
      profilePayload,
      jobPayload
    );
    const validation = validateJobMatchAIOutput(rawResult);
    if (!validation.success) {
      return null;
    }
    return validation.data;
  } catch {
    return null;
  }
}

interface PersistMatchOptions {
  userId: string;
  jobId: string;
  job: Record<string, unknown>;
  profilePayload: JobMatchProfilePayload;
  jobPayload: JobMatchJobPayload;
  deterministic: DeterministicMatchResult;
  aiData: JobMatchAIOutput | null;
  profileVersion: string;
  jobVersion: string;
  model: string;
}

async function persistMatch(
  options: PersistMatchOptions
): Promise<IJobMatch> {
  const {
    userId,
    jobId,
    deterministic,
    aiData,
    profileVersion,
    jobVersion,
    model,
  } = options;

  const deterministicScore = clampMatchScore(deterministic.score, 0);
  const aiScoreRaw = aiData ? aiData.score : null;
  const { aiScore, finalScore } = combineScores(deterministicScore, aiScoreRaw);
  const matchLevel: MatchLevel = matchLevelFromScore(finalScore);

  const jobSkillCount = Math.max(1, (options.jobPayload.skills ?? []).length);
  const appliedRatio = deterministic.matchingSkills.length / jobSkillCount;
  const recommendation: MatchRecommendation =
    aiData && aiData.recommendation
      ? aiData.recommendation
      : deriveRecommendationFromScore(finalScore, appliedRatio);

  const now = new Date();
  const cacheHours = getJobMatchCacheHours();
  const expiresAt =
    cacheHours > 0 ? new Date(now.getTime() + cacheHours * 60 * 60 * 1000) : null;

  // Full AI-derived narrative when AI succeeded; otherwise the deterministic
  // notes/explanations carry the same conceptual fields so the shape is stable.
  const match = await JobMatch.create({
    user: new Types.ObjectId(userId),
    job: new Types.ObjectId(jobId),
    aiModel: aiData ? model : "deterministic",
    promptVersion: JOB_MATCH_PROMPT_VERSION,
    score: finalScore,
    deterministicScore,
    aiScore,
    finalScore,
    matchLevel,
    summary:
      aiData?.summary ||
      `Deterministic score ${deterministicScore}/100 (${matchLevel.replace(/_/g, " ")}).`,
    matchingSkills: aiData?.matchingSkills?.length
      ? aiData.matchingSkills
      : deterministic.matchingSkills,
    missingSkills: aiData?.missingSkills?.length
      ? aiData.missingSkills
      : deterministic.missingSkills,
    matchingTechnologies: aiData?.matchingTechnologies?.length
      ? aiData.matchingTechnologies
      : deterministic.matchingTechnologies,
    missingTechnologies: aiData?.missingTechnologies?.length
      ? aiData.missingTechnologies
      : deterministic.missingTechnologies,
    experienceMatch: aiData?.experienceMatch || deterministic.experienceMatch,
    experienceGap: aiData?.experienceGap || deterministic.experienceGap,
    educationMatch: aiData?.educationMatch || deterministic.educationMatch,
    educationGap: aiData?.educationGap || "None significant",
    locationMatch: aiData?.locationMatch || deterministic.locationMatch,
    remoteMatch: aiData?.remoteMatch || deterministic.remoteMatch,
    employmentTypeMatch:
      aiData?.employmentTypeMatch || deterministic.employmentTypeMatch,
    salaryMatch: aiData?.salaryMatch || deterministic.salaryMatch,
    strengths: aiData?.strengths?.length ? aiData.strengths : [],
    weaknesses: aiData?.weaknesses?.length
      ? aiData.weaknesses
      : deterministic.missingSkills.slice(0, 5),
    gaps: aiData?.gaps?.length ? aiData.gaps : [],
    recommendation,
    recommendationReason:
      aiData?.recommendationReason || deterministic.recommendationReason,
    profileVersion,
    jobVersion,
    algorithmVersion: JOB_MATCH_ALGORITHM_VERSION,
    analyzedAt: now,
    expiresAt,
  });

  return match;
}

export async function findCachedValidVersioned(
  userId: string,
  jobId: string,
  profileVersion: string,
  jobVersion: string
) {
  const now = new Date();
  return JobMatch.findOne({
    user: userId,
    job: jobId,
    profileVersion,
    jobVersion,
    algorithmVersion: JOB_MATCH_ALGORITHM_VERSION,
    promptVersion: JOB_MATCH_PROMPT_VERSION,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  }).sort({ analyzedAt: -1 });
}

async function findCachedValid(userId: string, jobId: string) {
  const now = new Date();
  return JobMatch.findOne({
    user: userId,
    job: jobId,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  }).sort({ analyzedAt: -1 });
}

export async function analyzeJobMatch(userId: string, jobId: string) {
  const job = await verifyJobExists(jobId);
  const { payload: profilePayload } = await prepareMatchProfile(userId);
  const jobPayload = prepareMatchJob(job);
  const deterministic = computeDeterministicMatch(profilePayload, jobPayload);
  const profileVersion = computeProfileVersion(profilePayload);
  const jobVersion = computeJobVersion(jobPayload);
  const model = getModel();

  const cached = await findCachedValidVersioned(
    userId,
    jobId,
    profileVersion,
    jobVersion
  );
  if (cached) {
    return { match: cached, job, cached: true };
  }

  const aiData = await analyzeJobWithFallback(profilePayload, jobPayload);
  const match = await persistMatch({
    userId,
    jobId,
    job,
    profilePayload,
    jobPayload,
    deterministic,
    aiData,
    profileVersion,
    jobVersion,
    model,
  });

  return { match, job, cached: false };
}

export async function getMatchForJob(userId: string, jobId: string) {
  const job = await verifyJobExists(jobId);

  const match = await JobMatch.findOne({
    user: userId,
    job: jobId,
  }).sort({ analyzedAt: -1 });

  if (!match) {
    throw new AppError("No job match found. Run analysis first.", 404);
  }

  return { match, job };
}

export async function reanalyzeJobMatch(userId: string, jobId: string) {
  const job = await verifyJobExists(jobId);
  const { payload: profilePayload } = await prepareMatchProfile(userId);
  const jobPayload = prepareMatchJob(job);
  const deterministic = computeDeterministicMatch(profilePayload, jobPayload);
  const profileVersion = computeProfileVersion(profilePayload);
  const jobVersion = computeJobVersion(jobPayload);
  const model = getModel();

  await JobMatch.deleteMany({ user: userId, job: new Types.ObjectId(jobId) });

  const aiData = await analyzeJobWithFallback(profilePayload, jobPayload);
  const match = await persistMatch({
    userId,
    jobId,
    job,
    profilePayload,
    jobPayload,
    deterministic,
    aiData,
    profileVersion,
    jobVersion,
    model,
  });

  return { match, job, cached: false };
}

/**
 * (Phase 2, Step 1) Bounded automatic matching for a user's discovered jobs.
 *
 * Runs outside the source-ingestion loop (triggered by the admin
 * automatic-discovery endpoint), reuses the versioned cache, only ever persists
 * a fresh match when the cached one is absent/expired/version-stale, and is
 * bounded to avoid N identical AI calls. AI failures degrade to deterministic
 * matches rather than throwing.
 */
export async function ensureMatchBatch(
  userId: string,
  options: { limit?: number } = {}
): Promise<{ analyzed: number; cached: number; deterministicOnly: number }> {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));

  const toProcess = await Job.find({ isActive: true })
    .limit(limit)
    .sort({ discoveredAt: -1 })
    .lean();

  if (toProcess.length === 0) {
    return { analyzed: 0, cached: 0, deterministicOnly: 0 };
  }

  const { payload: profilePayload } = await prepareMatchProfile(userId);
  const profileVersion = computeProfileVersion(profilePayload);
  const model = getModel();

  let analyzed = 0;
  let cached = 0;
  let deterministicOnly = 0;

  for (const job of toProcess) {
    const jobId = String(job._id);
    const jobPayload = prepareMatchJob(job);
    const jobVersion = computeJobVersion(jobPayload);

    const existing = await findCachedValidVersioned(
      userId,
      jobId,
      profileVersion,
      jobVersion
    );
    if (existing) {
      cached += 1;
      continue;
    }

    const deterministic = computeDeterministicMatch(profilePayload, jobPayload);
    const aiData = await analyzeJobWithFallback(profilePayload, jobPayload);
    if (!aiData) deterministicOnly += 1;

    await persistMatch({
      userId,
      jobId,
      job,
      profilePayload,
      jobPayload,
      deterministic,
      aiData,
      profileVersion,
      jobVersion,
      model,
    });
    analyzed += 1;
  }

  return { analyzed, cached, deterministicOnly };
}

export async function listJobMatches(
  userId: string,
  query: JobMatchListQuery
): Promise<ListMatchesResult> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { user: userId };

  if (typeof query.minScore === "number" && query.minScore >= 0) {
    filter.score = { $gte: query.minScore };
  }
  if (query.matchLevel) {
    filter.matchLevel = query.matchLevel;
  }

  let sort: Record<string, 1 | -1> = { analyzedAt: -1 };
  if (query.sort === "score_asc") {
    sort = { score: 1 };
  } else if (query.sort === "score_desc") {
    sort = { score: -1 };
  } else if (query.sort === "newest") {
    sort = { analyzedAt: -1 };
  }

  const [matches, total] = await Promise.all([
    JobMatch.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate({ path: "job", select: "title companyName source" })
      .lean(),
    JobMatch.countDocuments(filter),
  ]);

  return {
    matches: matches as unknown as IJobMatch[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
