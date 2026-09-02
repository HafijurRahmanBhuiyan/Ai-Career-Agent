import crypto from "crypto";
import {
  RawJob,
  NormalizedJob,
  JobSearchParams,
} from "../integrations/jobs/jobSource.types";
import {
  RemoteType,
  EmploymentType,
  ExperienceLevel,
  SalaryPeriod,
} from "../models/Job";

export const MAX_DESCRIPTION_CHARS = 10000;
const VALID_URL_PROTOCOLS = ["http:", "https:"];

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

export function normalizeCompany(company: string): string {
  return company.trim().replace(/\s+/g, " ");
}

export function normalizeLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const trimmed = location.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeRemote(value: string | undefined): RemoteType {
  const v = (value || "onsite").toLowerCase();
  if (v === "remote" || v === "hybrid") return v as RemoteType;
  return "onsite";
}

export function normalizeEmployment(value: string | undefined): EmploymentType {
  const v = (value || "full-time").toLowerCase().replace(/_/g, "-");
  const valid: EmploymentType[] = ["full-time", "part-time", "contract", "internship", "temporary"];
  return valid.includes(v as EmploymentType) ? (v as EmploymentType) : "full-time";
}

export function normalizeExperience(value: string | undefined): ExperienceLevel {
  const v = (value || "mid").toLowerCase();
  const valid: ExperienceLevel[] = ["entry", "junior", "mid", "senior", "lead", "manager"];
  return valid.includes(v as ExperienceLevel) ? (v as ExperienceLevel) : "mid";
}

export function normalizeSalaryPeriod(value: string | undefined | null): SalaryPeriod | null {
  if (!value) return null;
  const v = value.toLowerCase();
  const valid: SalaryPeriod[] = ["yearly", "monthly", "hourly", "contract"];
  return valid.includes(v as SalaryPeriod) ? (v as SalaryPeriod) : null;
}

export function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim())
    .filter((v, idx, arr) => arr.indexOf(v) === idx);
}

export function isValidUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!VALID_URL_PROTOCOLS.includes(parsed.protocol)) return null;
  return parsed.toString();
}

export function limitDescription(description: string | null | undefined): string {
  if (!description) return "";
  const cleaned = description.trim();
  if (cleaned.length <= MAX_DESCRIPTION_CHARS) return cleaned;
  return cleaned.slice(0, MAX_DESCRIPTION_CHARS);
}

export function hashCode(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function generateFingerprint(
  source: string,
  company: string,
  title: string,
  location: string | null,
  applyUrl: string | null
): string {
  const normalizedCompany = normalizeCompany(company).toLowerCase();
  const normalizedTitle = normalizeTitle(title).toLowerCase();
  const normalizedLocation = (normalizeLocation(location) || "").toLowerCase();
  const url = applyUrl ? applyUrl.toLowerCase() : "";
  const base = [source, normalizedCompany, normalizedTitle, normalizedLocation, url].join("::");
  return hashCode(base);
}

/**
 * Generate a stable canonical identity for a job that is independent of the
 * provider it came from. It is based only on stable identity fields:
 * company, title, locations, remote type, and employment type. It deliberately
 * excludes source-specific identities (source/sourceJobId), descriptions,
 * skills, salary, and URLs so that the same vacancy arriving through multiple
 * providers collapses to one canonical key, while distinct vacancies remain
 * separate.
 */
export function generateCanonicalFingerprint(job: {
  companyName?: string;
  title?: string;
  locations?: string[];
  remoteType?: RemoteType | string;
  employmentType?: EmploymentType | string;
}): string {
  const company = normalizeCompany(job.companyName?.trim() ? job.companyName : "").toLowerCase();
  const title = normalizeTitle(job.title?.trim() ? job.title : "").toLowerCase();

  const locations = normalizeStringArray(job.locations ?? [])
    .map((l) => l.toLowerCase())
    .sort();

  const remote = normalizeRemote(job.remoteType).toLowerCase();
  const employment = normalizeEmployment(job.employmentType).toLowerCase();

  const base = [company, title, locations.join("|"), remote, employment].join("::");
  return hashCode(base);
}

export function normalizeSourceJobId(
  source: string,
  rawJob: RawJob
): string {
  if (rawJob.rawData && typeof rawJob.rawData.sourceJobId === "string") {
    return rawJob.rawData.sourceJobId;
  }
  if (rawJob.rawData && typeof rawJob.rawData.id === "string") {
    return `${source}:${rawJob.rawData.id}`;
  }
  if (rawJob.rawData && typeof rawJob.rawData.id === "number") {
    return `${source}:${rawJob.rawData.id}`;
  }
  return generateFingerprint(
    source,
    rawJob.companyName,
    rawJob.title,
    rawJob.location ?? rawJob.locations?.[0] ?? null,
    rawJob.applyUrl ?? rawJob.jobUrl ?? null
  );
}

export function normalizeJob(source: string, rawJob: RawJob): NormalizedJob {
  const locations = normalizeStringArray(rawJob.locations ?? []);

  return {
    source,
    sourceJobId: normalizeSourceJobId(source, rawJob),
    fingerprint: generateFingerprint(
      source,
      rawJob.companyName,
      rawJob.title,
      rawJob.location ?? locations[0] ?? null,
      rawJob.applyUrl ?? rawJob.jobUrl ?? null
    ),
    canonicalFingerprint: generateCanonicalFingerprint({
      companyName: rawJob.companyName,
      title: rawJob.title,
      locations: locations.length > 0 ? locations : [rawJob.location ?? locations[0] ?? ""],
      remoteType: rawJob.remoteType,
      employmentType: rawJob.employmentType,
    }),
    title: normalizeTitle(rawJob.title),
    companyName: normalizeCompany(rawJob.companyName),
    companyLogo: isValidUrl(rawJob.companyLogo) ?? undefined,
    description: limitDescription(rawJob.description),
    location: normalizeLocation(rawJob.location ?? locations[0] ?? null),
    locations,
    remoteType: normalizeRemote(rawJob.remoteType),
    employmentType: normalizeEmployment(rawJob.employmentType),
    experienceLevel: normalizeExperience(rawJob.experienceLevel),
    salaryMin: typeof rawJob.salaryMin === "number" ? rawJob.salaryMin : null,
    salaryMax: typeof rawJob.salaryMax === "number" ? rawJob.salaryMax : null,
    salaryCurrency: rawJob.salaryCurrency || null,
    salaryPeriod: normalizeSalaryPeriod(rawJob.salaryPeriod),
    skills: normalizeStringArray(rawJob.skills ?? []),
    technologies: normalizeStringArray(rawJob.technologies ?? []),
    jobUrl: isValidUrl(rawJob.jobUrl) ?? undefined,
    applyUrl: isValidUrl(rawJob.applyUrl) ?? undefined,
    postedAt: rawJob.postedAt ? new Date(rawJob.postedAt) : null,
    expiresAt: rawJob.expiresAt ? new Date(rawJob.expiresAt) : null,
    rawSource: rawJob.rawData ?? {},
  };
}

export function buildKeywordsQuery(raw: string): Record<string, unknown> {
  const terms = raw
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const escaped = escapeRegex(t);
      return {
        $or: [
          { title: { $regex: escaped, $options: "i" } },
          { companyName: { $regex: escaped, $options: "i" } },
          { location: { $regex: escaped, $options: "i" } },
          { description: { $regex: escaped, $options: "i" } },
        ],
      };
    });

  if (terms.length === 0) return {};
  return { $and: terms };
}

export function escapeKeywordForMongo(raw: string): string {
  return escapeRegex(raw);
}

export function searchParamsToFilter(
  params: JobSearchParams,
  defaultKeyword: string | undefined
): Record<string, unknown> {
  const filter: Record<string, unknown> = { isActive: true };

  const query = params.keywords?.trim() || defaultKeyword?.trim();
  if (query) {
    filter.$and = [
      {
        $or: [
          { title: { $regex: escapeRegex(query), $options: "i" } },
          { companyName: { $regex: escapeRegex(query), $options: "i" } },
          { location: { $regex: escapeRegex(query), $options: "i" } },
          { description: { $regex: escapeRegex(query), $options: "i" } },
        ],
      },
    ];
  }

  if (params.locations && params.locations.length > 0) {
    const locPatterns = params.locations.map((loc) => escapeRegex(loc));
    filter.locations = { $in: locPatterns.map((p) => new RegExp(p, "i")) };
  }

  if (params.remote && params.remote !== "any") {
    filter.remoteType = params.remote;
  }

  if (params.employmentType) {
    filter.employmentType = params.employmentType;
  }

  if (params.experienceLevel) {
    filter.experienceLevel = params.experienceLevel;
  }

  return filter;
}
