import api from "../api/client";
import type {
  ApplicationStatus,
  CapabilityInfo,
  ExecutionInfo,
} from "../types/application";

export interface SaveApplicationResponse {
  application: {
    _id: string;
    status: ApplicationStatus;
    job?: unknown;
    appliedAt?: string | null;
    notes?: string | null;
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface ConfirmApplicationResponse {
  submitted: boolean;
  statusChanged: boolean;
  message: string;
  application: ExecutionInfo["application"];
  capabilityInfo: CapabilityInfo & { statusUnchanged?: boolean };
}

/**
 * Saves/creates the user's local Application with status "saved" for a job.
 * Does not open any external site and does not create a new record when one
 * already exists (server enforces the unique { user, job } index).
 */
export async function saveApplication(jobId: string): Promise<SaveApplicationResponse> {
  const res = await api.post<SaveApplicationResponse>("/applications", { jobId });
  return res.data;
}

/**
 * Opportunity dashboard Apply compose. Creates/reuses the local Application
 * (status stays "saved") and returns the execution/handoff payload so the UI
 * can open the validated external URL and later confirm submission.
 */
export async function applyFromOpportunity(jobId: string): Promise<ExecutionInfo> {
  const res = await api.post<ExecutionInfo>(`/jobs/opportunities/${jobId}/apply`);
  return res.data;
}

/**
 * Explicit submission confirmation. Only this existing endpoint (with
 * { submitted: true }) may advance the application to "applied".
 */
export async function confirmApplication(
  applicationId: string
): Promise<ConfirmApplicationResponse> {
  const res = await api.post<ConfirmApplicationResponse>(
    `/applications/${applicationId}/execution`,
    { submitted: true }
  );
  return res.data;
}