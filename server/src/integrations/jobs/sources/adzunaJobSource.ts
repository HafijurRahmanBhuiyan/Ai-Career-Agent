import { JobSource, JobSearchParams, JobSourceResult, RawJob } from "../jobSource.types";
import { fetchJson, HttpFetchError } from "./http";

interface AdzunaLocation {
  display_name?: string;
  area?: string[];
}

interface AdzunaCompany {
  display_name?: string;
}

interface AdzunaResult {
  id: string | number;
  title?: string;
  description?: string;
  created?: string;
  redirect_url?: string;
  salary_min?: number;
  salary_max?: number;
  contract_type?: string;
  contract_time?: string;
  location?: AdzunaLocation;
  company?: AdzunaCompany;
}

interface AdzunaResponse {
  results?: AdzunaResult[];
}

const DEFAULT_COUNTRY = "gb";

export class AdzunaJobSource implements JobSource {
  readonly id = "adzuna";
  readonly name = "Adzuna";

  private isConfigured(): boolean {
    return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
  }

  private getCountry(): string {
    return (process.env.ADZUNA_COUNTRY || DEFAULT_COUNTRY).toLowerCase();
  }

  async searchJobs(params: JobSearchParams): Promise<JobSourceResult> {
    if (!this.isConfigured()) {
      throw new HttpFetchError("Adzuna is not configured: ADZUNA_APP_ID / ADZUNA_APP_KEY are missing", 503);
    }

    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 50);

    const query = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID!,
      app_key: process.env.ADZUNA_APP_KEY!,
      results_per_page: String(limit),
      content_type: "application/json",
      "content-type": "application/json",
    });

    if (params.keywords?.trim()) {
      query.set("what", params.keywords.trim());
    }
    if (params.locations && params.locations.length > 0) {
      query.set("where", params.locations[0]);
    }
    if (typeof params.salaryMinimum === "number") {
      query.set("salary_min", String(params.salaryMinimum));
    }
    if (params.employmentType === "full-time") query.set("full_time", "1");
    if (params.employmentType === "part-time") query.set("part_time", "1");
    if (params.employmentType === "contract") query.set("contract", "1");

    const country = this.getCountry();
    const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${query.toString()}`;

    const data = await fetchJson<AdzunaResponse>(url);

    const rawJobs: RawJob[] = (data.results || []).map((r) => {
      const locationName =
        r.location?.display_name || r.location?.area?.slice(-1)[0] || null;
      const locations = r.location?.area?.length
        ? r.location.area
        : locationName
        ? [locationName]
        : [];
      const title = r.title || "";
      const description = r.description || "";

      const remoteType = /(remote|remote-first|distributed)\b/i.test(
        `${title} ${description}`
      )
        ? "remote"
        : "onsite";

      const employmentType = r.contract_time === "part_time" ? "part-time" : "full-time";

      return {
        title,
        companyName: r.company?.display_name || "Unknown",
        description,
        location: locationName,
        locations,
        remoteType,
        employmentType: r.contract_type === "contract" ? "contract" : employmentType,
        experienceLevel: mapAdzunaSeniority(title),
        salaryMin: typeof r.salary_min === "number" ? r.salary_min : null,
        salaryMax: typeof r.salary_max === "number" ? r.salary_max : null,
        salaryCurrency: "USD",
        salaryPeriod: "yearly",
        jobUrl: r.redirect_url || null,
        applyUrl: r.redirect_url || null,
        postedAt: r.created || null,
        rawData: {
          id: String(r.id),
          category: undefined,
        },
      };
    });

    return { jobs: rawJobs };
  }

  async healthCheck() {
    if (!this.isConfigured()) {
      return { healthy: false, message: "Adzuna not configured (missing ADZUNA_APP_ID / ADZUNA_APP_KEY)" };
    }
    return { healthy: true, message: "Adzuna is configured" };
  }
}

function mapAdzunaSeniority(title: string): string {
  const normalized = title.toLowerCase();
  if (/\b(senior|lead|principal|staff|sr\.?)\b/.test(normalized)) return "senior";
  if (/\b(junior|jr\.?|graduate|entry)\b/.test(normalized)) return "junior";
  if (/\b(mid|intermediate)\b/.test(normalized)) return "mid";
  return "mid";
}
