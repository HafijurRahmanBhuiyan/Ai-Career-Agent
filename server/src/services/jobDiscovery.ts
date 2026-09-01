import mongoose, { FlattenMaps } from "mongoose";
import Job, { IJob } from "../models/Job";
import {
  JobSearchParams,
  JobSource,
  SourceReport,
} from "../integrations/jobs/jobSource.types";
import { getEnabledJobSources } from "../integrations/jobs/jobSourceRegistry";
import { normalizeJob, escapeRegex } from "./jobNormalization";
import { deduplicateJobs } from "./jobDeduplication";
import { AppError } from "../middleware/errorHandler";

export interface DiscoveryResult {
  jobs: Array<FlattenMaps<IJob> & { _id: mongoose.Types.ObjectId }>;
  count: number;
  sources: SourceReport[];
}

export async function discoverJobs(
  params: JobSearchParams,
  sources: JobSource[] = getEnabledJobSources()
): Promise<DiscoveryResult> {
  if (sources.length === 0) {
    throw new AppError("No job sources are configured", 503);
  }

  const reports: SourceReport[] = [];
  const allNormalized: ReturnType<typeof normalizeJob>[] = [];

  for (const source of sources) {
    try {
      const result = await source.searchJobs(params);
      const normalized = result.jobs.map((raw) => normalizeJob(source.id, raw));
      allNormalized.push(...normalized);
      reports.push({
        source: source.id,
        status: "success",
        count: normalized.length,
      });
    } catch {
      reports.push({
        source: source.id,
        status: "error",
        message: "Job source failed",
      });
    }
  }

  const uniqueJobs = deduplicateJobs(allNormalized);

  const now = new Date();

  if (uniqueJobs.length > 0) {
    const operations = uniqueJobs.map((job) => {
      const sourcesSet = Array.isArray(job.metadata?.sources)
        ? (job.metadata.sources as string[])
        : [job.source];

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
        rawSource: job.rawSource ?? {},
        lastSeenAt: now,
        isActive: true,
        "metadata.canonicalFingerprint": job.canonicalFingerprint || null,
      };

      const setOnInsert: Record<string, unknown> = {
        source: job.source,
        sourceJobId: job.sourceJobId,
        discoveredAt: now,
      };

      if (job.fingerprint) {
        setOnInsert.fingerprint = job.fingerprint;
      }

      // Upsert by canonical identity first (so the same vacancy from different
      // providers collapses to one record), falling back to the strongest
      // source-scoped identity (source + sourceJobId). Content is refreshed
      // from the winning record and source attribution accumulates across runs
      // via $addToSet.
      const filter: Record<string, unknown> = {
        $or: [
          { "metadata.canonicalFingerprint": job.canonicalFingerprint || "" },
          { source: job.source, sourceJobId: job.sourceJobId },
        ],
      };

      return {
        updateOne: {
          filter,
          update: {
            $set: setFields,
            $setOnInsert: setOnInsert,
            $addToSet: { "metadata.sources": { $each: sourcesSet } },
          },
          upsert: true,
        },
      };
    });

    await Job.bulkWrite(operations, { ordered: false });
  }

  // Retrieve the persisted records. Merged cross-source duplicates are matched
  // by their canonical fingerprint; fall back to source + sourceJobId for any
  // record that was inserted/updated purely on its source-scoped identity.
  const fingerprintMatch: Record<string, unknown>[] = [];
  const sourceIdMatch: Record<string, unknown>[] = [];
  const canonicalFps = Array.from(
    new Set(uniqueJobs.map((j) => j.canonicalFingerprint).filter(Boolean))
  );
  if (canonicalFps.length > 0) {
    fingerprintMatch.push({
      "metadata.canonicalFingerprint": { $in: canonicalFps },
    });
  }
  sourceIdMatch.push(
    ...uniqueJobs.map((j) => ({
      source: j.source,
      sourceJobId: j.sourceJobId,
    }))
  );

  const jobs = await Job.find({
    $or: [...fingerprintMatch, ...sourceIdMatch],
  }).lean();

  return {
    jobs,
    count: jobs.length,
    sources: reports,
  };
}

export function buildKeywordQuery(keyword: string | undefined): Record<string, unknown> {
  if (!keyword || !keyword.trim()) return {};
  return {
    $or: [
      { title: { $regex: escapeRegex(keyword.trim()), $options: "i" } },
      { companyName: { $regex: escapeRegex(keyword.trim()), $options: "i" } },
      { location: { $regex: escapeRegex(keyword.trim()), $options: "i" } },
      { description: { $regex: escapeRegex(keyword.trim()), $options: "i" } },
    ],
  };
}
