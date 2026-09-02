import { Request, Response, NextFunction } from "express";
import Job from "../models/Job";
import Profile from "../models/Profile";
import User from "../models/User";
import { discoverJobs } from "../services/jobDiscovery";
import { deactivateStaleJobs } from "../services/jobMaintenance";
import { runAutomaticDiscovery, collectEligibleUsers } from "../services/jobAutomaticDiscovery";
import { ensureMatchBatch } from "../services/jobMatching";
import { AppError } from "../middleware/errorHandler";
import { jobSearchQuerySchema, jobDiscoverRequestSchema } from "../validators/job";
import { searchParamsToFilter } from "../services/jobNormalization";
import { resolveDiscoveryParams } from "../services/jobSearchPreferences";
import { Role } from "../types";

export const getJobs = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = jobSearchQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return res.status(422).json({
        error: "Validation failed",
        statusCode: 422,
        details,
      });
    }

    const { keywords, location, remote, employmentType, experienceLevel } =
      parsed.data;

    const page = parsed.data.page ?? 1;
    const limit = parsed.data.limit ?? 20;
    const skip = (page - 1) * limit;

    const profile = await Profile.findOne({ user: req.user!.id });
    const resolved = resolveDiscoveryParams(
      {
        keywords,
        locations: location ? [location] : undefined,
        remote,
        employmentType,
        experienceLevel,
        page,
        limit,
      },
      profile
    );

    const filter = searchParamsToFilter(resolved, undefined);

    const [jobs, total] = await Promise.all([
      Job.find(filter).sort({ postedAt: -1 }).skip(skip).limit(limit).lean(),
      Job.countDocuments(filter),
    ]);

    res.status(200).json({
      jobs: jobs.map(toSafeJob),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const discover = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = jobDiscoverRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return res.status(422).json({
        error: "Validation failed",
        statusCode: 422,
        details,
      });
    }

    const profile = await Profile.findOne({ user: req.user!.id });
    const resolved = resolveDiscoveryParams(parsed.data, profile);
    const result = await discoverJobs(resolved);

    res.status(200).json({
      jobs: result.jobs.map(toSafeJob),
      count: result.count,
      sources: result.sources,
    });
  } catch (error) {
    next(error);
  }
};

export const getJob = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      isActive: true,
    }).lean();

    if (!job) {
      return next(new AppError("Job not found", 404));
    }

    res.status(200).json({ job: toSafeJob(job) });
  } catch (error) {
    next(error);
  }
};

export const runJobMaintenance = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await deactivateStaleJobs();
    // Only aggregate counts are exposed; no sensitive job data is returned.
    res.status(200).json({
      evaluated: result.evaluated,
      deactivated: result.deactivated,
      staleDays: result.staleDays,
      cutoff: result.cutoff.toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin-only internal trigger for canonical/global automatic discovery (Phase 1,
 * Step 7). The n8n scheduler calls this instead of the per-user `/discover`.
 *
 * It loads all profiles and active end-user accounts once, then lets the service
 * compute a single deduplicated query set across every eligible user. Only
 * aggregate statistics are returned (no raw job payload, no per-user data) so the
 * internal trigger is safe to run unattended and leaks no sensitive information.
 *
 * (Phase 2, Step 1) After ingestion it runs bounded automatic AI matching for
 * each eligible user (outside the source-ingestion loop, reusing the versioned
 * JobMatch cache) so the dashboard can display matches for discovered jobs.
 */
export const runAutomaticDiscoveryHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const [profiles, users] = await Promise.all([
      Profile.find()
        .select("user preferredRoles preferredLocations workPreference jobSearchPreferences")
        .lean(),
      User.find({ isActive: true, role: Role.USER })
        .select("_id isActive role")
        .lean(),
    ]);

    const result = await runAutomaticDiscovery({
      profiles,
      users,
    });

    const { eligible } = collectEligibleUsers(profiles, users);

    const rawLimit = parseInt(process.env.JOB_MATCH_AUTO_LIMIT || "10", 10);
    const matchLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 10;

    let matchedJobs = 0;
    let fromCache = 0;
    let deterministicOnly = 0;
    let matchUsers = 0;

    for (const eligibleUser of eligible) {
      try {
        const batch = await ensureMatchBatch(eligibleUser.userId, {
          limit: matchLimit,
        });
        matchedJobs += batch.analyzed;
        fromCache += batch.cached;
        deterministicOnly += batch.deterministicOnly;
        if (batch.analyzed > 0 || batch.cached > 0) matchUsers += 1;
      } catch {
        // A single user's matching must not abort the whole discovery run.
      }
    }

    res.status(200).json({
      count: result.count,
      queryCount: result.queryCount,
      stats: result.stats,
      sources: result.sources,
      matching: {
        matchUsers,
        matchedJobs,
        fromCache,
        deterministicOnly,
      },
    });
  } catch (error) {
    next(error);
  }
};

function toSafeJob<T extends object>(job: T): Record<string, unknown> {
  const { rawSource, ...safe } = job as Record<string, unknown>;
  void rawSource;
  return safe;
}
