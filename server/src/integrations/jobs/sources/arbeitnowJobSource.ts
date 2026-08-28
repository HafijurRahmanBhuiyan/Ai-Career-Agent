import { JobSource, JobSearchParams, JobSourceResult, RawJob } from "../jobSource.types";
import { fetchJson, HttpFetchError } from "./http";

interface ArbeitnowJob {
  slug: string;
  title?: string;
  company_name?: string;
  location?: string;
  remote?: boolean | string;
  url: string;
  description?: string;
  tags?: string[];
  job_types?: string[];
  created_at?: string;
}

interface ArbeitnowResponse {
  data?: ArbeitnowJob[];
}

const BASE_URL = "https://www.arbeitnow.com/api/job-board-api";

export class ArbeitnowJobSource implements JobSource {
  readonly id = "arbeitnow";
  readonly name = "Arbeitnow";

  private isConfigured(): boolean {
    return true;
  }

  async searchJobs(params: JobSearchParams): Promise<JobSourceResult> {
    if (!this.isConfigured()) {
      throw new HttpFetchError("Arbeitnow is not configured", 503);
    }

    const page = params.page ?? 1;
    const url = `${BASE_URL}?page=${page}`;
    const data = await fetchJson<ArbeitnowResponse>(url);

    let jobs = (data.data || []).filter((job) => job && typeof job.slug === "string");

    if (params.keywords?.trim()) {
      const keywordPattern = params.keywords.trim().toLowerCase();
      jobs = jobs.filter((job) => {
        const haystack = `${job.title || ""} ${job.description || ""} ${
          job.tags?.join(" ") || ""
        }`.toLowerCase();
        return haystack.includes(keywordPattern);
      });
    }

    if (params.locations && params.locations.length > 0) {
      const locationQuery = params.locations.join(" ").toLowerCase();
      jobs = jobs.filter((job) =>
        (job.location || "").toLowerCase().includes(locationQuery)
      );
    }

    if (params.remote && params.remote !== "any") {
      const wantRemote = params.remote === "remote";
      jobs = jobs.filter((job) => {
        const isRemote = job.remote === true || (typeof job.remote === "string" && /remote/i.test(job.remote));
        return isRemote === wantRemote || (!wantRemote && !isRemote && job.location);
      });
    }

    if (params.employmentType) {
      jobs = jobs.filter((job) =>
        (job.job_types || []).some((t) =>
          t.toLowerCase().replace(/[_-]/g, "-").includes(params.employmentType!.toLowerCase())
        )
      );
    }

    const limit = Math.min(params.limit ?? 20, 50);
    const start = Math.max(0, (page - 1) * limit);
    const paged = jobs.slice(start, start + limit);

    const rawJobs: RawJob[] = paged.map((job) => ({
      title: job.title || "Untitled role",
      companyName: job.company_name || "Unknown",
      description: job.description || "",
      location: job.location || null,
      locations: job.location ? [job.location] : [],
      remoteType: isArbeitnowRemote(job.remote),
      employmentType: normalizeArbeitnowJobType(job.job_types),
      experienceLevel: "mid",
      skills: job.tags || [],
      technologies: job.tags || [],
      jobUrl: job.url || null,
      applyUrl: job.url || null,
      postedAt: job.created_at || null,
      rawData: { id: job.slug },
    }));

    return { jobs: rawJobs };
  }

  async healthCheck() {
    return { healthy: true, message: "Arbeitnow is available without an API key" };
  }
}

function isArbeitnowRemote(remote: boolean | string | undefined): string {
  if (remote === true || (typeof remote === "string" && /remote/i.test(remote))) {
    return "remote";
  }
  return "onsite";
}

function normalizeArbeitnowJobType(jobTypes?: string[]): string {
  if (!jobTypes || jobTypes.length === 0) return "full-time";
  const types = jobTypes.map((t) => t.toLowerCase()).join(" ");
  if (/part[-_ ]?time/.test(types)) return "part-time";
  if (/contract|freelance/.test(types)) return "contract";
  if (/intern/.test(types)) return "internship";
  if (/temporary/.test(types)) return "temporary";
  return "full-time";
}
