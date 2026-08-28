import { Types } from "mongoose";
import { Application } from "../models/Application";
import Job, { IJob } from "../models/Job";
import { AppError } from "../middleware/errorHandler";
import { classifyApplyCapability } from "./applyCapability";
import { createStatusChangedEvent } from "./applicationTimeline";

const JOB_EXECUTION_FIELDS =
  "title companyName location locations remoteType employmentType source sourceJobId jobUrl applyUrl applyCapability metadata rawSource";

interface LoadedApplication {
  application: {
    _id: Types.ObjectId;
    user: Types.ObjectId;
    job: Types.ObjectId;
    status: string;
    appliedAt?: Date | null;
    notes?: string;
    updatedAt: Date;
  };
  job: IJob;
}

function toSafeJob(job: IJob): Record<string, unknown> {
  return {
    id: job._id,
    title: job.title,
    companyName: job.companyName,
    location: job.location,
    locations: job.locations,
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    source: job.source,
    sourceJobId: job.sourceJobId,
    jobUrl: job.jobUrl,
    applyUrl: job.applyUrl,
    applyCapability: job.applyCapability,
  };
}

function safeApplication(app: LoadedApplication["application"]): Record<string, unknown> {
  return {
    id: app._id,
    job: app.job,
    status: app.status,
    appliedAt: app.appliedAt,
    notes: app.notes,
    updatedAt: app.updatedAt,
  };
}

async function loadOwnedApplication(
  userId: string,
  applicationId: string
): Promise<LoadedApplication> {
  if (!Types.ObjectId.isValid(applicationId)) {
    throw new AppError("Application not found", 404);
  }

  const application = await Application.findOne({
    _id: applicationId,
    user: userId,
  });

  if (!application) {
    throw new AppError("Application not found", 404);
  }

  const job = await Job.findById(application.job).select(JOB_EXECUTION_FIELDS);
  if (!job) {
    throw new AppError("Linked job not found", 404);
  }

  return {
    application: {
      _id: application._id,
      user: application.user,
      job: application.job,
      status: application.status,
      appliedAt: application.appliedAt,
      notes: application.notes,
      updatedAt: application.updatedAt,
    },
    job,
  };
}

export class ApplicationExecutionService {
  /**
   * Read-only view of how a user can apply and the current application state.
   * Never changes status.
   */
  async getExecutionInfo(userId: string, applicationId: string) {
    const { application, job } = await loadOwnedApplication(userId, applicationId);
    const capability = classifyApplyCapability(job);
    return {
      application: safeApplication(application),
      job: toSafeJob(job),
      capabilityInfo: {
        capability: capability.capability,
        label: capability.label,
        handoffUrl: capability.handoffUrl,
        canApplyInline: false,
        statusUnchanged: true,
      },
    };
  }

  /**
   * Prepare/Review phase. Returns instructions and the real handoff URL (never
   * invented). Does NOT open anything server-side and does NOT change status.
   */
  async prepare(userId: string, applicationId: string) {
    const { application, job } = await loadOwnedApplication(userId, applicationId);
    const capability = classifyApplyCapability(job);

    let instructions: string;
    if (capability.capability === "external_url") {
      instructions =
        "This application is completed on the employer's external site. Open the handoff URL and finish there; then come back and confirm to record it.";
    } else if (capability.capability === "supported_api") {
      instructions =
        "An official apply API has been declared for this source, but automated submission is not wired up in this milestone. Do not assume it was submitted; apply through the available channel and confirm manually.";
    } else {
      instructions =
        "No direct application URL is available, so the application must be completed manually on the employer's own site.";
    }

    return {
      capabilityInfo: {
        capability: capability.capability,
        label: capability.label,
        handoffUrl: capability.handoffUrl,
        canApplyInline: false,
      },
      source: {
        id: job.source,
        sourceJobId: job.sourceJobId,
        jobUrl: job.jobUrl,
        applyUrl: job.applyUrl,
      },
      instructions,
      review: {
        recommendedSteps: [
          "Review your resume and portfolio against the role.",
          "Open the handoff URL (if provided) in your browser.",
          "Complete and submit the application on the employer's site.",
        ],
        statusWillChangeOnConfirm: false,
      },
      application: safeApplication(application),
    };
  }

  /**
   * Execute (handoff + explicit completion confirmation).
   *
   * - When `submitted` is false/omitted: returns handoff info only. No status
   *   change. The agent never applies on the user's behalf.
   * - When `submitted` is true: this is the user's explicit confirmation that
   *   they completed the external application, and only then is the status
   *   advanced to "applied".
   */
  async execute(
    userId: string,
    applicationId: string,
    input: { submitted: boolean }
  ) {
    const { job } = await loadOwnedApplication(userId, applicationId);
    const capability = classifyApplyCapability(job);

    const application = await Application.findOne({
      _id: applicationId,
      user: userId,
    });
    if (!application) {
      throw new AppError("Application not found", 404);
    }

    const alreadyApplied = application.status === "applied";

    if (!input.submitted) {
      return {
        submitted: false,
        statusChanged: false,
        message: "Application was handed off; it is NOT recorded as submitted.",
        capabilityInfo: {
          capability: capability.capability,
          label: capability.label,
          handoffUrl: capability.handoffUrl,
          canApplyInline: false,
        },
        application: safeApplication({
          _id: application._id,
          user: application.user,
          job: application.job,
          status: application.status,
          appliedAt: application.appliedAt,
          notes: application.notes,
          updatedAt: application.updatedAt,
        }),
      };
    }

    if (capability.capability === "supported_api") {
      // Do not pretend an automated submission happened. The user confirms
      // they completed it through the available channel.
      if (!alreadyApplied) {
        application.status = "applied";
        application.appliedAt = new Date();
        await application.save();
        await createStatusChangedEvent(userId, String(application._id), "applied");
      }
      return {
        submitted: true,
        statusChanged: !alreadyApplied,
        message:
          "Confirmed as applied. Note: no automated API submission occurred in this milestone.",
        capabilityInfo: {
          capability: capability.capability,
          label: capability.label,
          handoffUrl: capability.handoffUrl,
          canApplyInline: false,
        },
        application: safeApplication({
          _id: application._id,
          user: application.user,
          job: application.job,
          status: application.status,
          appliedAt: application.appliedAt,
          notes: application.notes,
          updatedAt: application.updatedAt,
        }),
      };
    }

    if (!alreadyApplied) {
      application.status = "applied";
      application.appliedAt = new Date();
      await application.save();
      await createStatusChangedEvent(userId, String(application._id), "applied");
    }

    return {
      submitted: true,
      statusChanged: !alreadyApplied,
      message: "Application recorded as applied after explicit confirmation.",
      capabilityInfo: {
        capability: capability.capability,
        label: capability.label,
        handoffUrl: capability.handoffUrl,
        canApplyInline: false,
      },
      application: safeApplication({
        _id: application._id,
        user: application.user,
        job: application.job,
        status: application.status,
        appliedAt: application.appliedAt,
        notes: application.notes,
        updatedAt: application.updatedAt,
      }),
    };
  }
}
