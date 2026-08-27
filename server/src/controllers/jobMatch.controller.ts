import { Request, Response, NextFunction } from "express";
import {
  analyzeJobMatch,
  getMatchForJob,
  reanalyzeJobMatch,
  listJobMatches,
} from "../services/jobMatching";
import { jobMatchListQuerySchema } from "../validators/jobMatchQuery";

export const analyzeMatch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const jobId = String(req.params.id);

    const { match, job, cached } = await analyzeJobMatch(userId, jobId);

    res.status(200).json({
      job: toSafeJob(job),
      match: toSafeMatch(match),
      cached,
    });
  } catch (error) {
    next(error);
  }
};

export const getMatch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const jobId = String(req.params.id);

    const { match, job } = await getMatchForJob(userId, jobId);

    res.status(200).json({
      job: toSafeJob(job),
      match: toSafeMatch(match),
    });
  } catch (error) {
    next(error);
  }
};

export const reanalyzeMatch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const jobId = String(req.params.id);

    const { match, job } = await reanalyzeJobMatch(userId, jobId);

    res.status(200).json({
      job: toSafeJob(job),
      match: toSafeMatch(match),
    });
  } catch (error) {
    next(error);
  }
};

export const getJobMatches = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;

    const parsed = jobMatchListQuerySchema.safeParse(req.query);
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

    const result = await listJobMatches(userId, parsed.data);

    res.status(200).json({
      matches: result.matches.map(toSafeMatch),
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

function toSafeJob<T extends object>(job: T): Record<string, unknown> {
  const { rawSource, metadata, ...safe } = job as Record<string, unknown>;
  void rawSource;
  void metadata;
  return safe;
}

function toSafeMatch<T extends object>(match: T): Record<string, unknown> {
  const source =
    match &&
    typeof (match as { toObject?: unknown }).toObject === "function"
      ? (match as unknown as { toObject: () => Record<string, unknown> }).toObject()
      : match;
  const { __v, user, ...safe } = source as Record<string, unknown>;
  void __v;
  void user;
  return safe;
}
