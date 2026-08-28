import { ApplyCapability } from "../models/Job";

/**
 * Classifies how a user can apply to a given job, WITHOUT ever inventing a URL
 * or claiming an automated API where none exists.
 *
 * - "external_url"     -> a real apply/job URL exists that the user completes
 *                         in their own browser (the agent only hands off).
 * - "supported_api"    -> there is an explicitly-declared, first-party official
 *                         apply API (from source metadata). Never assumed.
 * - "manual_required"  -> no usable apply URL and no supported API; the user
 *                         must apply manually through the native site (e.g. a
 *                         LinkedIn job without an official member apply API).
 */
export type ApplyCapabilityResult = {
  capability: ApplyCapability;
  handoffUrl: string | null;
  label: string;
};

const LINKEDIN_SOURCES = ["linkedin", "linkedin_jobs"];

function hasHttpUrl(value: unknown): string | null {
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
}

export function classifyApplyCapability(job: {
  source?: string;
  sourceJobId?: string;
  jobUrl?: string | null;
  applyUrl?: string | null;
  rawSource?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): ApplyCapabilityResult {
  const source = (job.source || "").toLowerCase();
  const applyUrl = hasHttpUrl(job.applyUrl);
  const jobUrl = hasHttpUrl(job.jobUrl);

  const rawSource = job.rawSource || {};
  const metadata = job.metadata || {};

  // An official, first-party apply API must be EXPLICITLY declared in the
  // source payload. We never infer "supported_api" from a mere URL or because
  // a source claims to be a well-known site.
  const declaredApplyApi = metadata.applyApi ?? rawSource.applyApi;
  const hasDeclaredApplyApi =
    typeof declaredApplyApi === "string" &&
    declaredApplyApi.toLowerCase() === "supported_api";

  if (hasDeclaredApplyApi) {
    return {
      capability: "supported_api",
      handoffUrl: applyUrl || jobUrl,
      label: "Supported API",
    };
  }

  // LinkedIn jobs are never automated just because they are on LinkedIn. With
  // no official member apply API declared, the user must apply manually. Use
  // the REAL source URL for handoff; never invent one.
  if (LINKEDIN_SOURCES.includes(source)) {
    return {
      capability: "manual_required",
      handoffUrl: applyUrl || jobUrl,
      label: "Manual required (LinkedIn)",
    };
  }

  if (applyUrl || jobUrl) {
    return {
      capability: "external_url",
      handoffUrl: applyUrl || jobUrl,
      label: "External application",
    };
  }

  return {
    capability: "manual_required",
    handoffUrl: null,
    label: "Manual required",
  };
}

export const APPLY_CAPABILITIES: ApplyCapability[] = [
  "external_url",
  "supported_api",
  "manual_required",
];
