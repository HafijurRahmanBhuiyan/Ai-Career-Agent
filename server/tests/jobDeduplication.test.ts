import { deduplicateJobs } from "../src/services/jobDeduplication";
import { normalizeJob } from "../src/services/jobNormalization";
import { RawJob, NormalizedJob } from "../src/integrations/jobs/jobSource.types";

function raw(overrides: Partial<RawJob> = {}): RawJob {
  return {
    title: "Software Engineer",
    companyName: "Acme Corp",
    description: "We are looking for a Software Engineer to join our team.",
    location: "Remote",
    remoteType: "remote",
    employmentType: "full-time",
    experienceLevel: "mid",
    skills: ["JavaScript"],
    technologies: ["React"],
    applyUrl: "https://example.com/apply/1",
    jobUrl: "https://example.com/job/1",
    rawData: { id: "1" },
    ...overrides,
  };
}

function norm(source: string, job: RawJob): NormalizedJob {
  return normalizeJob(source, job);
}

describe("jobDeduplication - canonical identity", () => {
  test("A. same source + same sourceJobId collapses to one job", () => {
    const jobs = [
      norm("adzuna", raw({ rawData: { id: "123" } })),
      norm("adzuna", raw({ rawData: { id: "123" } })),
    ];
    const result = deduplicateJobs(jobs);
    expect(result).toHaveLength(1);
  });

  test("B. different sources + same canonical identity collapse to one job", () => {
    const a = norm("adzuna", raw({ rawData: { id: "1" } }));
    const b = norm("remoteok", raw({ rawData: { id: "2" } }));
    const result = deduplicateJobs([a, b]);
    expect(result).toHaveLength(1);
    // Source attribution preserved on the winner.
    expect((result[0].metadata?.sources as string[]).sort()).toEqual([
      "adzuna",
      "remoteok",
    ]);
  });

  test("C. different companies remain separate", () => {
    const a = norm("adzuna", raw({ companyName: "Acme Corp" }));
    const b = norm("remoteok", raw({ companyName: "Globex" }));
    expect(a.canonicalFingerprint).not.toBe(b.canonicalFingerprint);
    const result = deduplicateJobs([a, b]);
    expect(result).toHaveLength(2);
  });

  test("D. different locations remain separate", () => {
    const a = norm("adzuna", raw({ ...raw(), location: "Dhaka" }));
    const b = norm("remoteok", raw({ ...raw(), location: "Chittagong" }));
    expect(a.canonicalFingerprint).not.toBe(b.canonicalFingerprint);
    const result = deduplicateJobs([a, b]);
    expect(result).toHaveLength(2);
  });

  test("E. different titles representing different roles remain separate", () => {
    const backend = norm("adzuna", raw({ title: "Backend Engineer" }));
    const frontend = norm("remoteok", raw({ title: "Frontend Engineer" }));
    expect(backend.canonicalFingerprint).not.toBe(frontend.canonicalFingerprint);
    const result = deduplicateJobs([backend, frontend]);
    expect(result).toHaveLength(2);
  });

  test("F. missing optional fields do not cause crashes", () => {
    const a = norm("adzuna", {
      title: "Software Engineer",
      companyName: "Acme",
      description: "Engineer role",
      rawData: { id: "1" },
    });
    const b = norm("remoteok", {
      title: "Software Engineer",
      companyName: "Acme",
      description: "Engineer role (remote)",
      rawData: { id: "2" },
    });
    expect(() => deduplicateJobs([a, b])).not.toThrow();
    const result = deduplicateJobs([a, b]);
    expect(result).toHaveLength(1);
  });

  test("G. winner selection is deterministic regardless of input order", () => {
    const thin = norm("remoteok", {
      ...raw(),
      description: "Short.",
      skills: [],
      technologies: [],
      salaryMin: null,
      salaryMax: null,
      applyUrl: null,
    });
    const rich = norm("adzuna", {
      ...raw(),
      description: "A much longer and more detailed description for the role.",
      skills: ["JavaScript", "TypeScript", "React", "Node.js"],
      technologies: ["React", "Node.js", "Docker"],
      salaryMin: 90000,
      salaryMax: 130000,
    });

    const forward = deduplicateJobs([thin, rich]);
    const reverse = deduplicateJobs([rich, thin]);

    expect(forward).toHaveLength(1);
    expect(reverse).toHaveLength(1);
    // Same canonical identity but the richer source wins regardless of order...
    // (the canonical is the same; deterministic tie-break by source/sourceJobId)
    expect(forward[0].source).toBe(reverse[0].source);
    expect(forward[0].sourceJobId).toBe(reverse[0].sourceJobId);
  });

  test("H. richer job data wins across sources", () => {
    const thin = norm("remoteok", {
      ...raw(),
      description: "Short description.",
      skills: [],
      technologies: [],
      salaryMin: null,
      salaryMax: null,
      applyUrl: null,
    });
    const rich = norm("adzuna", {
      ...raw(),
      description: "A detailed, comprehensive description of the vacancy and requirements.",
      skills: ["JavaScript", "TypeScript", "React", "Node.js"],
      technologies: ["React", "Node.js", "Docker"],
      salaryMin: 90000,
      salaryMax: 130000,
    });

    const result = deduplicateJobs([thin, rich]);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe(rich.description);
    expect(result[0].skills).toEqual(rich.skills);
    expect(result[0].salaryMin).toBe(90000);
  });

  test("I. existing source-scoped dedup behavior remains intact (same source, same fingerprint)", () => {
    // Two jobs from the SAME source with identical canonical identity collapse
    // to a single record (not a cross-source merge).
    const a = norm("arbeitnow", raw({ rawData: { slug: "job-1" } }));
    const b = norm("arbeitnow", raw({ rawData: { slug: "job-2" } }));
    const result = deduplicateJobs([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("arbeitnow");
  });
});
