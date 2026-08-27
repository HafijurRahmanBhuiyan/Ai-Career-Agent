import { Request, Response, NextFunction } from "express";
import { Application } from "../models/Application";
import Job from "../models/Job";
import { AppError } from "../middleware/errorHandler";
import {
  applicationListQuerySchema,
  CreateApplicationInput,
  UpdateApplicationInput,
} from "../validators/application";

const JOB_POPULATE_FIELDS =
  "title companyName location locations remoteType employmentType source";

const isDuplicateKeyError = (error: unknown): boolean => {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
};

const getApplicationForUser = async (
  userId: string,
  appId: string,
  { populateJob = true } = {}
) => {
  const query = Application.findOne({ _id: appId, user: userId });
  if (populateJob) {
    query.populate("job", JOB_POPULATE_FIELDS);
  }
  return query.lean();
};

export const createApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const body = req.body as CreateApplicationInput;

    const job = await Job.findOne({ _id: body.jobId, isActive: true }).lean();
    if (!job) {
      return next(new AppError("Job not found", 404));
    }

    const status = body.status ?? "saved";

    let appliedAt: Date | undefined;
    if (body.appliedAt) {
      appliedAt = new Date(body.appliedAt);
    } else if (status === "applied") {
      appliedAt = new Date();
    }

    const application = new Application({
      user: userId,
      job: body.jobId,
      status,
      appliedAt,
      notes: body.notes,
    });

    try {
      await application.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return next(new AppError("Application already exists for this job", 409));
      }
      throw error;
    }

    await application.populate("job", JOB_POPULATE_FIELDS);

    res.status(201).json({ application: toSafeApplication(application) });
  } catch (error) {
    next(error);
  }
};

export const getApplications = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;

    const parsed = applicationListQuerySchema.safeParse(req.query);
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

    const { page, limit, status } = parsed.data;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = { user: userId };
    if (status) {
      filter.status = status;
    }

    const [applications, total] = await Promise.all([
      Application.find(filter)
        .populate("job", JOB_POPULATE_FIELDS)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Application.countDocuments(filter),
    ]);

    res.status(200).json({
      applications: applications.map(toSafeApplication),
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

export const getApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const application = await getApplicationForUser(userId, String(req.params.id));

    if (!application) {
      return next(new AppError("Application not found", 404));
    }

    res.status(200).json({ application: toSafeApplication(application) });
  } catch (error) {
    next(error);
  }
};

export const updateApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const body = req.body as UpdateApplicationInput;
    const appId = String(req.params.id);

    const existing = await Application.findOne({ _id: appId, user: userId }).lean();
    if (!existing) {
      return next(new AppError("Application not found", 404));
    }

    const updateData: Record<string, unknown> = {};

    if (body.status !== undefined) {
      updateData.status = body.status;
    }

    if (body.appliedAt !== undefined) {
      // Explicitly clearing the date is allowed (e.g. appliedAt: null).
      updateData.appliedAt = body.appliedAt === null ? null : new Date(body.appliedAt);
    } else if (
      body.status === "applied" &&
      existing.status !== "applied" &&
      existing.appliedAt === undefined
    ) {
      // Transitioning to "applied" without a date -> set it to now.
      updateData.appliedAt = new Date();
    }

    if (body.notes !== undefined) {
      updateData.notes = body.notes;
    }

    const application = await Application.findOneAndUpdate(
      { _id: appId, user: userId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate("job", JOB_POPULATE_FIELDS);

    if (!application) {
      return next(new AppError("Application not found", 404));
    }

    res.status(200).json({ application: toSafeApplication(application) });
  } catch (error) {
    next(error);
  }
};

export const deleteApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const application = await Application.findOneAndDelete({
      _id: req.params.id,
      user: userId,
    });

    if (!application) {
      return next(new AppError("Application not found", 404));
    }

    res.status(200).json({ message: "Application deleted" });
  } catch (error) {
    next(error);
  }
};

function toSafeApplication<T extends object>(
  application: T
): Record<string, unknown> {
  const source =
    application &&
    typeof (application as { toObject?: unknown }).toObject === "function"
      ? (application as unknown as { toObject: () => Record<string, unknown> }).toObject()
      : application;

  const { __v, user, ...safe } = source as Record<string, unknown>;
  void __v;
  void user;

  if (safe.job && typeof safe.job === "object") {
    const jobRecord = safe.job as Record<string, unknown>;
    const { rawSource, metadata, ...safeJob } = jobRecord;
    void rawSource;
    void metadata;
    safe.job = safeJob;
  }

  return safe;
}
