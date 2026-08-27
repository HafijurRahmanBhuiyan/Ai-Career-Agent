import { NormalizedJob } from "../integrations/jobs/jobSource.types";

export function deduplicateJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const seenById = new Map<string, NormalizedJob>();
  const seenByFingerprint = new Map<string, NormalizedJob>();

  for (const job of jobs) {
    const idKey = `${job.source}::${job.sourceJobId}`;

    if (seenById.has(idKey)) continue;

    if (job.fingerprint) {
      const existingFp = seenByFingerprint.get(job.fingerprint);
      if (existingFp && existingFp.source === job.source) {
        continue;
      }
    }

    seenById.set(idKey, job);
    if (job.fingerprint) {
      seenByFingerprint.set(job.fingerprint, job);
    }
  }

  return Array.from(seenById.values());
}
