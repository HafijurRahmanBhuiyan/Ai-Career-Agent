import { Request, Response, NextFunction } from "express";
import { AppError } from "../middleware/errorHandler";
import { getOpportunityFeed, getOpportunityDetail } from "../services/opportunityFeed";
import { ingestJobs } from "../services/jobIngestion";
import { opportunityQuerySchema, jobIngestSchema } from "../validators/opportunity";
import { Application } from "../models/Application";
import Job from "../models/Job";
import { ApplicationExecutionService } from "../services/applicationExecution";
import { createApplicationCreatedEvent } from "../services/applicationTimeline";

const isValidObjectId = (id: string): boolean => /^[0-9a-fA-F]{24}$/.test(id);

const isDuplicateKeyError = (error: unknown): boolean => {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
};

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

/**
 * Compose endpoint for the Opportunity dashboard Apply flow.
 *
 * Creates (status: "saved") or reuses the user's existing Application for the
 * job, then delegates to the existing ApplicationExecutionService to build the
 * handoff/preparation payload. It NEVER advances the status to "applied" and
 * never sets appliedAt - only the explicit confirmation endpoint
 * (POST /api/applications/:id/execution with { submitted: true }) may do that.
 */
export const applyOpportunity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const jobId = String(req.params.id);

    if (!isValidObjectId(jobId)) {
      return next(new AppError("Job not found", 404));
    }

    const job = await Job.findOne({ _id: jobId, isActive: true }).lean();
    if (!job) {
      return next(new AppError("Job not found", 404));
    }

    let application = await Application.findOne({ user: userId, job: jobId });
    if (!application) {
      try {
        application = new Application({ user: userId, job: jobId, status: "saved" });
        await application.save();
        await createApplicationCreatedEvent(userId, String(application._id));
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
        // Concurrent duplicate (unique { user, job } index). Reuse the record
        // that won the race instead of failing the user.
        application = await Application.findOne({ user: userId, job: jobId });
        if (!application) {
          throw error;
        }
      }
    }

    const payload = await new ApplicationExecutionService().getExecutionInfo(
      userId,
      String(application._id)
    );

    res.status(200).json(payload);
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
