import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { GmailService } from "../services/gmail";
import { validateOAuthState } from "../utils/oauthState";
import { AppError } from "../middleware/errorHandler";
import { CareerEmail } from "../models/CareerEmail";
import { Application } from "../models/Application";
import GmailConnection from "../models/GmailConnection";
import { createStatusChangedEvent } from "../services/applicationTimeline";
import {
  isAllowedStatusTransition,
  isDetectedStatusTarget,
} from "../services/careerStatusTransitions";
import {
  applyStatusSchema,
  emailListQuerySchema,
  syncQuerySchema,
} from "../validators/gmail";

const gmailService = new GmailService();

export const connect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { authorizeUrl, state } = gmailService.getAuthorizeUrl(req.user!.id);
    res.status(200).json({ authorizeUrl, state });
  } catch (error) {
    next(error);
  }
};

export const callback = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { code, state } = req.query;

    if (!code || !state || typeof code !== "string" || typeof state !== "string") {
      return next(new AppError("Missing authorization code or state", 400));
    }

    const stateValidation = validateOAuthState(state);
    if (!stateValidation.valid || !stateValidation.userId) {
      return next(new AppError(stateValidation.error || "Invalid OAuth state", 400));
    }

    if (stateValidation.userId !== req.user!.id) {
      return next(new AppError("OAuth state does not belong to the authenticated user", 400));
    }

    await gmailService.completeConnection(req.user!.id, code);

    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    res.redirect(`${clientUrl}/dashboard/integrations?gmail=connected`);
  } catch (error) {
    next(error);
  }
};

export const disconnect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await gmailService.disconnect(req.user!.id);
    res.status(200).json({ message: "Gmail account disconnected" });
  } catch (error) {
    next(error);
  }
};

export const getStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const status = await gmailService.getStatus(req.user!.id);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
};

export const sync = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = syncQuerySchema.safeParse(req.query);
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

    const result = await gmailService.syncEmails(
      req.user!.id,
      parsed.data.max
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const syncAll = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const connections = await GmailConnection.find({
      isActive: { $ne: false },
    });

    const results: { user: string; ok: boolean; error?: string }[] = [];
    let synced = 0;
    let careerEmails = 0;
    let classified = 0;
    let skipped = 0;
    let failed = 0;
    let autoUpdated = 0;
    let careerEvents = 0;
    const errors: { user: string; message: string }[] = [];

    for (const connection of connections) {
      const userId = String(connection.user);
      try {
        const result = await gmailService.syncEmails(userId);
        results.push({ user: userId, ok: true });
        synced += result.synced;
        careerEmails += result.careerEmails;
        classified += result.classified;
        skipped += result.skipped;
        failed += result.failed;
        autoUpdated += result.autoUpdated;
        careerEvents += result.careerEvents;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        errors.push({ user: userId, message });
        results.push({ user: userId, ok: false, error: message });
      }
    }

    res.status(200).json({
      users: results.length,
      synced,
      careerEmails,
      classified,
      skipped,
      failed,
      autoUpdated,
      careerEvents,
      errors,
    });
  } catch (error) {
    next(error);
  }
};

export const listEmails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = emailListQuerySchema.safeParse(req.query);
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

    const { page, limit, category, applicationStatus, sort } = parsed.data;

    const result = await gmailService.listEmails(req.user!.id, {
      page,
      limit,
      category,
      applicationStatus,
      sort,
    });

    res.status(200).json({
      emails: result.emails.map(toSafeEmail),
      pagination: {
        page: result.page,
        limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const email = await gmailService.getEmail(
      req.user!.id,
      String(req.params.id)
    );
    res.status(200).json({ email: toSafeEmail(email) });
  } catch (error) {
    next(error);
  }
};

export const applyStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = applyStatusSchema.safeParse(req.body);
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
    const emailId = String(req.params.id);

    if (!Types.ObjectId.isValid(emailId)) {
      return next(new AppError("Email intelligence not found", 404));
    }

    const email = await CareerEmail.findOne({ _id: emailId, user: userId });

    if (!email) {
      return next(new AppError("Email intelligence not found", 404));
    }

    if (!email.application) {
      return next(
        new AppError("This email is not linked to a tracked application", 400)
      );
    }

    const application = await Application.findOne({
      _id: email.application,
      user: userId,
    });

    if (!application) {
      return next(new AppError("Linked application not found", 404));
    }

    const target = parsed.data.status;

    // Server-side only: never trust the client to bypass detection guards. The
    // manual flow may only apply hiring stages Gmail detection itself derives.
    if (!isDetectedStatusTarget(target)) {
      return next(
        new AppError(
          "Only detected hiring stages may be applied from career emails",
          400
        )
      );
    }

    const manualMetadata = {
      manualStatusApplied: true,
      manualStatusAppliedAt: new Date(),
      manualStatusReason: `Manually applied status "${target}" to the linked application from this career email`,
    };

    // Idempotent: applying the already-current status records the manual
    // metadata but never mutates the application or creates another event.
    // Checked before the transition guard because same-status is a no-op, not
    // an invalid forward move.
    if (application.status === target) {
      await CareerEmail.updateOne({ _id: email._id }, { $set: manualMetadata });
      return res.status(200).json({
        application: toSafeApplication(application),
        unchanged: true,
        message: `Application status is already ${target}`,
      });
    }

    if (!isAllowedStatusTransition(application.status, target)) {
      return next(
        new AppError(
          `Transition from ${application.status} to ${target} is not allowed`,
          409
        )
      );
    }

    application.status = target;
    await application.save();

    await CareerEmail.updateOne({ _id: email._id }, { $set: manualMetadata });

    // Exactly one status_changed event per transition. createStatusChangedEvent
    // is only called when the status actually changed, so re-posts are no-ops.
    await createStatusChangedEvent(
      userId,
      String(application._id),
      target
    );

    res.status(200).json({
      application: toSafeApplication(application),
      message: `Application status updated to ${target}`,
    });
  } catch (error) {
    next(error);
  }
};

function toSafeEmail(email: unknown): Record<string, unknown> {
  const record = email as Record<string, unknown>;
  const { _id, user, rawMetadata, ...safe } = record;
  void user;
  void rawMetadata;
  void _id;
  return {
    ...safe,
    id: _id,
  };
}

function toSafeApplication(application: {
  _id: unknown;
  job: unknown;
  status: unknown;
  appliedAt?: unknown;
  notes?: unknown;
  updatedAt: unknown;
}): Record<string, unknown> {
  return {
    id: application._id,
    job: application.job,
    status: application.status,
    appliedAt: application.appliedAt,
    notes: application.notes,
    updatedAt: application.updatedAt,
  };
}
