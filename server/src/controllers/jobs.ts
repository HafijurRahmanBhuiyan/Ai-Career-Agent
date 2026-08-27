import { Request, Response, NextFunction } from "express";
import Job from "../models/Job";
import Profile from "../models/Profile";
import { discoverJobs } from "../services/jobDiscovery";
import { AppError } from "../middleware/errorHandler";
import { jobSearchQuerySchema, jobDiscoverRequestSchema } from "../validators/job";
import { searchParamsToFilter } from "../services/jobNormalization";

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

    let defaultKeyword: string | undefined;
    const profile = await Profile.findOne({ user: req.user!.id });
    if (profile && profile.preferredRoles.length > 0 && !keywords) {
      defaultKeyword = profile.preferredRoles[0];
    }

    const filter = searchParamsToFilter(
      {
        keywords,
        locations: location ? [location] : undefined,
        remote,
        employmentType,
        experienceLevel,
      },
      defaultKeyword
    );

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

    const result = await discoverJobs(parsed.data);

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

function toSafeJob<T extends object>(job: T): Record<string, unknown> {
  const { rawSource, ...safe } = job as Record<string, unknown>;
  void rawSource;
  return safe;
}
