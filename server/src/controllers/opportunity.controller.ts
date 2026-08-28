import { Request, Response, NextFunction } from "express";
import { AppError } from "../middleware/errorHandler";
import { getOpportunityFeed, getOpportunityDetail } from "../services/opportunityFeed";
import { ingestJobs } from "../services/jobIngestion";
import { opportunityQuerySchema, jobIngestSchema } from "../validators/opportunity";

export const getOpportunities = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = opportunityQuerySchema.safeParse(req.query);
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

    const userId = req.user!.id;
    const result = await getOpportunityFeed(userId, parsed.data);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getOpportunity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const jobId = String(req.params.id);

    const detail = await getOpportunityDetail(userId, jobId);
    res.status(200).json(detail);
  } catch (error) {
    next(error);
  }
};

export const ingestJobsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = jobIngestSchema.safeParse(req.body ?? {});
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

    if (!parsed.data.jobs || parsed.data.jobs.length === 0) {
      return next(new AppError("No jobs to ingest", 422));
    }

    const result = await ingestJobs(parsed.data);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
