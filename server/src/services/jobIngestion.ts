import Job from "../models/Job";
import { RawJob } from "../integrations/jobs/jobSource.types";
import { normalizeJob, isValidUrl } from "./jobNormalization";
import { deduplicateJobs } from "./jobDeduplication";
import { classifyApplyCapability } from "./applyCapability";
import { AppError } from "../middleware/errorHandler";
import { JobIngestInput } from "../validators/opportunity";

const SENSITIVE_KEYS = [
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "apiKey",
  "api_key",
  "secret",
  "password",
  "authorization",
  "clientSecret",
  "client_secret",
];

function stripSensitiveKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSensitiveKeys);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
        continue;
      }
      out[key] = stripSensitiveKeys(val);
    }
    return out;
  }
  return value;
}

export interface IngestResult {
  inserted: number;
  updated: number;
  skippedDuplicates: number;
  totalJobs: number;
}

export async function ingestJobs(input: JobIngestInput): Promise<IngestResult> {
  const rawJobs: RawJob[] = input.jobs.map((job) => {
    const rawData =
      job.rawData && typeof job.rawData === "object"
        ? stripSensitiveKeys(job.rawData)
        : {};

    return {
      title: job.title,
      companyName: job.companyName,
      description: job.description,
      companyLogo: isValidUrl(job.companyLogo ?? null) ?? null,
      location: job.location ?? null,
      locations: job.locations ?? [],
      remoteType: job.remoteType,
      employmentType: job.employmentType,
      experienceLevel: job.experienceLevel,
      salaryMin: job.salaryMin ?? null,
      salaryMax: job.salaryMax ?? null,
      salaryCurrency: job.salaryCurrency ?? null,
      salaryPeriod: job.salaryPeriod ?? null,
      skills: job.skills ?? [],
      technologies: job.technologies ?? [],
      jobUrl: isValidUrl(job.jobUrl ?? null) ?? null,
      applyUrl: isValidUrl(job.applyUrl ?? null) ?? null,
      postedAt: job.postedAt ? new Date(job.postedAt) : null,
      expiresAt: job.expiresAt ? new Date(job.expiresAt) : null,
      rawData: {
        sourceJobId: job.sourceJobId,
        ...(rawData as Record<string, unknown>),
      },
    };
  });

  const source = input.jobs[0].source;

  const normalized = rawJobs.map((raw) => {
    const n = normalizeJob(source, raw);
    return n;
  });

  if (normalized.length === 0) {
    throw new AppError("No valid jobs to ingest", 422);
  }

  const uniqueJobs = deduplicateJobs(normalized);

  const now = new Date();
  const operations = uniqueJobs.map((job) => {
    const setFields: Record<string, unknown> = {
      title: job.title,
      companyName: job.companyName,
      companyLogo: job.companyLogo ?? null,
      description: job.description,
      location: job.location ?? null,
      locations: job.locations,
      remoteType: job.remoteType,
      employmentType: job.employmentType,
      experienceLevel: job.experienceLevel,
      salaryMin: job.salaryMin ?? null,
      salaryMax: job.salaryMax ?? null,
      salaryCurrency: job.salaryCurrency ?? null,
      salaryPeriod: job.salaryPeriod ?? null,
      skills: job.skills,
      technologies: job.technologies,
      jobUrl: job.jobUrl ?? null,
      applyUrl: job.applyUrl ?? null,
      postedAt: job.postedAt ?? null,
      expiresAt: job.expiresAt ?? null,
      rawSource: stripSensitiveKeys(job.rawSource ?? {}),
      applyCapability: classifyApplyCapability(job).capability,
      lastSeenAt: now,
      isActive: true,
    };

    const setOnInsert: Record<string, unknown> = {
      source: job.source,
      sourceJobId: job.sourceJobId,
      discoveredAt: now,
    };

    if (job.fingerprint) {
      setOnInsert.fingerprint = job.fingerprint;
    }

    return {
      updateOne: {
        filter: {
          source: job.source,
          sourceJobId: job.sourceJobId,
        },
        update: {
          $set: setFields,
          $setOnInsert: setOnInsert,
        },
        upsert: true,
      },
    };
  });

  const result = await Job.bulkWrite(operations, { ordered: false });

  return {
    inserted: result.upsertedCount ?? 0,
    updated: result.modifiedCount ?? 0,
    skippedDuplicates: normalized.length - uniqueJobs.length,
    totalJobs: uniqueJobs.length,
  };
}
