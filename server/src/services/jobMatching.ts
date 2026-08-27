import { Types } from "mongoose";
import Job from "../models/Job";
import JobMatch, { IJobMatch } from "../models/JobMatch";
import { ClaudeService } from "../integrations/claude/claude.service";
import { getModel } from "../integrations/claude/claudeClient";
import { JOB_MATCH_PROMPT_VERSION } from "../integrations/claude/jobMatchPrompts";
import {
  validateJobMatchAIOutput,
  matchLevelFromScore,
} from "../validators/jobMatch";
import { prepareMatchProfile } from "./jobMatchProfile";
import { prepareMatchJob } from "./jobMatchJob";
import { AppError } from "../middleware/errorHandler";

const claudeService = new ClaudeService();

export const JOB_MATCH_CACHE_HOURS_DEFAULT = 24 * 7;

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

async function verifyJobExists(jobId: string) {
  const job = await Job.findOne({ _id: jobId, isActive: true }).lean();
  if (!job) {
    throw new AppError("Job not found", 404);
  }
  return job;
}

async function runClaudeAnalysis(userId: string, jobId: string) {
  const job = await verifyJobExists(jobId);

  const { payload: profilePayload } = await prepareMatchProfile(userId);
  const jobPayload = prepareMatchJob(job);

  const rawResult = await claudeService.analyzeJobMatch(
    profilePayload,
    jobPayload
  );

  const validation = validateJobMatchAIOutput(rawResult);
  if (!validation.success) {
    throw new AppError(
      `Job match validation failed: ${validation.error}`,
      422
    );
  }

  const score = validation.data.score;
  const matchLevel = matchLevelFromScore(score);

  const cacheHours = getJobMatchCacheHours();
  const analyzedAt = new Date();
  const expiresAt =
    cacheHours > 0
      ? new Date(analyzedAt.getTime() + cacheHours * 60 * 60 * 1000)
      : null;

  const model = getModel();

  const match = await JobMatch.create({
    user: new Types.ObjectId(userId),
    job: new Types.ObjectId(jobId),
    aiModel: model,
    promptVersion: JOB_MATCH_PROMPT_VERSION,
    score,
    matchLevel,
    summary: validation.data.summary,
    matchingSkills: validation.data.matchingSkills,
    missingSkills: validation.data.missingSkills,
    matchingTechnologies: validation.data.matchingTechnologies,
    missingTechnologies: validation.data.missingTechnologies,
    experienceMatch: validation.data.experienceMatch,
    experienceGap: validation.data.experienceGap,
    educationMatch: validation.data.educationMatch,
    educationGap: validation.data.educationGap,
    locationMatch: validation.data.locationMatch,
    remoteMatch: validation.data.remoteMatch,
    employmentTypeMatch: validation.data.employmentTypeMatch,
    salaryMatch: validation.data.salaryMatch,
    strengths: validation.data.strengths,
    weaknesses: validation.data.weaknesses,
    recommendation: validation.data.recommendation,
    recommendationReason: validation.data.recommendationReason,
    analyzedAt,
    expiresAt,
  });

  return { match, job };
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
  const cached = await findCachedValid(userId, jobId);
  if (cached) {
    return { match: cached, job: await verifyJobExists(jobId), cached: true };
  }

  const { match, job } = await runClaudeAnalysis(userId, jobId);
  return { match, job, cached: false };
}

export async function getMatchForJob(userId: string, jobId: string) {
  await verifyJobExists(jobId);

  const match = await JobMatch.findOne({
    user: userId,
    job: jobId,
  }).sort({ analyzedAt: -1 });

  if (!match) {
    throw new AppError("No job match found. Run analysis first.", 404);
  }

  return { match, job: await verifyJobExists(jobId) };
}

export async function reanalyzeJobMatch(userId: string, jobId: string) {
  await verifyJobExists(jobId);

  await JobMatch.deleteMany({ user: userId, job: new Types.ObjectId(jobId) });

  const { match, job } = await runClaudeAnalysis(userId, jobId);

  return { match, job, cached: false };
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
