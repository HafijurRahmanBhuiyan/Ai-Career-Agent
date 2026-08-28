import { JobSource, JobSearchParams, JobSourceResult, RawJob } from "../jobSource.types";
import { fetchJson, HttpFetchError } from "./http";

interface RemoteOkJob {
  id?: string | number;
  slug?: string;
  position?: string;
  company?: string;
  tags?: string[];
  description?: string;
  location?: string;
  url?: string;
  apply_url?: string;
  date?: string;
  epoch?: number;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
}

const BASE_URL = "https://remoteok.com/api";

export class RemoteOkJobSource implements JobSource {
  readonly id = "remoteok";
  readonly name = "RemoteOK";

  private isConfigured(): boolean {
    return true;
  }

  async searchJobs(params: JobSearchParams): Promise<JobSourceResult> {
    if (!this.isConfigured()) {
      throw new HttpFetchError("RemoteOK is not configured", 503);
    }

    const url = `${BASE_URL}?page=${Math.max(1, params.page ?? 1)}`;
    const data = await fetchJson<unknown[]>(url);

    const jobs: RemoteOkJob[] = (Array.isArray(data) ? data : [])
      .filter((item, index) => index > 0 && isRemoteOkJob(item))
      .map((item) => item as RemoteOkJob);

    let filtered = jobs;

    if (params.keywords?.trim()) {
      const keywordPattern = params.keywords.trim().toLowerCase();
      filtered = filtered.filter((job) => {
        const haystack = `${job.position || ""} ${
          job.company || ""
        } ${job.tags?.join(" ") || ""} ${job.description || ""}`.toLowerCase();
        return keywordPattern
          .split(/\s+/)
          .every((term) => haystack.includes(term));
      });
    }

    if (params.locations && params.locations.length > 0) {
      const locationQuery = params.locations.join(" ").toLowerCase();
      filtered = filtered.filter((job) => {
        const location = (job.location || "").toLowerCase();
        return location.includes(locationQuery) || /remote/i.test(location);
      });
    }

    if (params.employmentType) {
      const type = params.employmentType.toLowerCase();
      filtered = filtered.filter((job) => {
        const haystack = `${job.position || ""} ${job.tags?.join(" ") || ""}`.toLowerCase();
        if (type === "full-time") return !/part[-_ ]?time|contract/i.test(haystack);
        if (type === "part-time") return /part[-_ ]?time/i.test(haystack);
        if (type === "contract") return /contract/i.test(haystack);
        return true;
      });
    }

    if (typeof params.salaryMinimum === "number") {
      filtered = filtered.filter((job) => (job.salary_min ?? 0) >= params.salaryMinimum!);
    }

    const limit = Math.min(params.limit ?? 20, 50);
    const rawJobs: RawJob[] = filtered.slice(0, limit).map((job) => ({
      title: job.position || "Untitled position",
      companyName: job.company || "Unknown",
      description: job.description || "",
      location: job.location || null,
      locations: job.location ? [job.location] : [],
      remoteType: "remote",
      employmentType: "full-time",
      experienceLevel: "mid",
      salaryMin: typeof job.salary_min === "number" ? job.salary_min : null,
      salaryMax: typeof job.salary_max === "number" ? job.salary_max : null,
      salaryCurrency: job.salary_currency || "USD",
      salaryPeriod: "yearly",
      skills: job.tags || [],
      technologies: job.tags || [],
      jobUrl: job.url || null,
      applyUrl: job.apply_url || job.url || null,
      postedAt: job.date || (job.epoch ? new Date(job.epoch * 1000).toISOString() : null),
      rawData: {
        id: String(job.id ?? ""),
        slug: job.slug,
      },
    }));

    return { jobs: rawJobs };
  }

  async healthCheck() {
    return { healthy: true, message: "RemoteOK is available without an API key" };
  }
}

function isRemoteOkJob(item: unknown): item is RemoteOkJob {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Record<string, unknown>;
  return typeof candidate.position === "string" || typeof candidate.id !== "undefined";
}
