import { NormalizedJob } from "../integrations/jobs/jobSource.types";
import {
  generateCanonicalFingerprint,
  isValidUrl,
} from "./jobNormalization";

/**
 * Deterministically compare two jobs that share a canonical identity and pick
 * the richer record to keep. Preference order (all deterministic, no random
 * tie-breaking):
 *   1. Longer, non-empty description
 *   2. More skills
 *   3. More technologies
 *   4. Has a valid application URL
 *   5. Has a valid job URL
 *   6. Has salary min and/or max
 *   7. Has a company logo
 * Ties are broken lexicographically by source then sourceJobId so the outcome
 * is stable across runs regardless of input ordering.
 */
function isRicher(a: NormalizedJob, b: NormalizedJob): number {
  const aDesc = (a.description || "").trim().length;
  const bDesc = (b.description || "").trim().length;
  if (aDesc !== bDesc) return aDesc - bDesc;

  if ((a.skills?.length || 0) !== (b.skills?.length || 0)) {
    return (a.skills?.length || 0) - (b.skills?.length || 0);
  }

  if ((a.technologies?.length || 0) !== (b.technologies?.length || 0)) {
    return (a.technologies?.length || 0) - (b.technologies?.length || 0);
  }

  const aApply = isValidUrl(a.applyUrl) ? 1 : 0;
  const bApply = isValidUrl(b.applyUrl) ? 1 : 0;
  if (aApply !== bApply) return aApply - bApply;

  const aJobUrl = isValidUrl(a.jobUrl) ? 1 : 0;
  const bJobUrl = isValidUrl(b.jobUrl) ? 1 : 0;
  if (aJobUrl !== bJobUrl) return aJobUrl - bJobUrl;

  const aSalary = a.salaryMin != null || a.salaryMax != null ? 1 : 0;
  const bSalary = b.salaryMin != null || b.salaryMax != null ? 1 : 0;
  if (aSalary !== bSalary) return aSalary - bSalary;

  const aLogo = a.companyLogo ? 1 : 0;
  const bLogo = b.companyLogo ? 1 : 0;
  if (aLogo !== bLogo) return aLogo - bLogo;

  const aKey = `${a.source}::${a.sourceJobId}`;
  const bKey = `${b.source}::${b.sourceJobId}`;
  return aKey.localeCompare(bKey);
}

function canonicalKey(job: NormalizedJob): string {
  return (
    job.canonicalFingerprint ||
    generateCanonicalFingerprint(job) ||
    "missing"
  );
}

/**
 * Deduplicate a batch of normalized jobs:
 *
 *  - Same source + same sourceJobId          -> exactly one job (source-scoped identity).
 *  - Same canonical identity across sources   -> one job (winning record kept).
 *
 * Source-scoped identity (source + sourceJobId) remains the strongest signal.
 * When multiple sources describe the same canonical vacancy, the deterministic
 * richer record wins and the contributing source ids are recorded on the winner
 * under `metadata.sources`. Distinct jobs (different company, location, title,
 * remote, or employment type) always remain separate because their canonical
 * keys differ.
 */
export function deduplicateJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const bySourceId = new Map<string, NormalizedJob>();
  const byCanonical = new Map<string, NormalizedJob[]>();

  for (const job of jobs) {
    const idKey = `${job.source}::${job.sourceJobId}`;
    const existing = bySourceId.get(idKey);
    if (existing) {
      // Same source, same sourceJobId: keep the richer of the two.
      if (isRicher(job, existing) > 0) {
        bySourceId.set(idKey, job);
      }
      continue;
    }
    bySourceId.set(idKey, job);

    const key = canonicalKey(job);
    const bucket = byCanonical.get(key);
    if (bucket) {
      bucket.push(job);
    } else {
      byCanonical.set(key, [job]);
    }
  }

  const result: NormalizedJob[] = [];
  for (const bucket of byCanonical.values()) {
    if (bucket.length === 1) {
      result.push(bucket[0]);
      continue;
    }

    // Preserve source-scoped dedup: if every entry shares the same source,
    // keep only the richest single record (no cross-source merge).
    const sources = new Set(bucket.map((j) => j.source));
    if (sources.size === 1) {
      result.push([...bucket].sort(isRicher).pop()!);
      continue;
    }

    const winner = [...bucket].sort(isRicher).pop()!;
    const contributingSources = bucket
      .map((j) => j.source)
      .filter((s, idx, arr) => arr.indexOf(s) === idx);

    const metadata = (winner.metadata ?? {}) as Record<string, unknown>;
    const existingSources = Array.isArray(metadata.sources)
      ? (metadata.sources as string[])
      : [];
    metadata.sources = Array.from(
      new Set([...existingSources, ...contributingSources])
    );
    winner.metadata = metadata;
    result.push(winner);
  }

  return result;
}
