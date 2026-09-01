import Job from "../models/Job";

/**
 * Deterministic, idempotent stale-job cleanup using soft deactivation.
 *
 * Jobs are considered stale when they have not been seen by the discovery
 * pipeline for longer than a configured period. Staleness is based solely on
 * `lastSeenAt` (updated on every discovery), never on `postedAt`, because an
 * old job can remain live while a newly discovered job can carry an old
 * `postedAt`.
 *
 * Only active jobs are ever touched, and they are soft-deactivated (isActive
 * set to false). No Job document, JobMatch, Application, timeline, analytics,
 * notification, or other historical data is deleted or modified.
 */

export const JOB_STALE_DAYS_DEFAULT = 14;

/**
 * Read the configured stale window in whole days.
 * Follows the project convention used by getAnalyticsStaleDays/getStaleDays:
 * a positive finite JOB_STALE_DAYS wins, otherwise a documented default keeps
 * behaviour conservative. A missing/invalid value never yields NaN or 0.
 */
export function getJobStaleDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.JOB_STALE_DAYS);
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.floor(raw);
  }
  return JOB_STALE_DAYS_DEFAULT;
}

export interface JobMaintenanceResult {
  /** Number of active jobs that matched the stale cutoff (candidates). */
  evaluated: number;
  /** Number of jobs actually soft-deactivated in this run. */
  deactivated: number;
  /** The cutoff timestamp used for this run (inclusive boundary semantics). */
  cutoff: Date;
  /** The configured stale window in days. */
  staleDays: number;
}

/**
 * Soft-deactivate jobs whose lastSeenAt is strictly older than the cutoff.
 *
 * Race-safe by construction: the update filter requires `lastSeenAt: { $lt:
 * cutoff }` at the moment of the update, so a job rediscovered (lastSeenAt
 * bumped forward) between the candidate count and the update will no longer
 * match and will not be deactivated.
 *
 * Boundary: a job whose lastSeenAt is exactly equal to the cutoff is treated as
 * fresh (not stale) — only a strictly older timestamp is stale.
 *
 * Missing/null lastSeenAt: excluded by the `$lt` filter (Mongo treats a missing
 * field as not matching a range query), so such jobs are never blindly
 * deactivated. They simply remain active.
 *
 * Idempotent: an already-inactive job never matches `isActive: true`, so a
 * second run deactivates nothing new.
 */
export async function deactivateStaleJobs(
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {}
): Promise<JobMaintenanceResult> {
  const now = options.now ?? new Date();
  const staleDays = getJobStaleDays(options.env);
  const cutoff = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);

  const filter: Record<string, unknown> = {
    isActive: true,
    lastSeenAt: { $lt: cutoff },
  };

  const evaluated = await Job.countDocuments(filter);

  const res = await Job.updateMany(filter, {
    $set: { isActive: false },
  });

  return {
    evaluated,
    deactivated: res.modifiedCount,
    cutoff,
    staleDays,
  };
}

export default deactivateStaleJobs;
