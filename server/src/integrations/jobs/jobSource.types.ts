import {
  RemoteType,
  EmploymentType,
  ExperienceLevel,
  SalaryPeriod,
} from "../../models/Job";

export interface JobSearchParams {
  keywords?: string;
  roles?: string[];
  locations?: string[];
  remote?: RemoteType | "any";
  employmentType?: EmploymentType;
  experienceLevel?: ExperienceLevel;
  salaryMinimum?: number;
  page?: number;
  limit?: number;
}

export interface RawJob {
  title: string;
  companyName: string;
  companyLogo?: string | null;
  description: string;
  location?: string | null;
  locations?: string[];
  remoteType?: RemoteType | string;
  employmentType?: EmploymentType | string;
  experienceLevel?: ExperienceLevel | string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: SalaryPeriod | string | null;
  skills?: string[];
  technologies?: string[];
  jobUrl?: string | null;
  applyUrl?: string | null;
  postedAt?: string | Date | null;
  expiresAt?: string | Date | null;
  rawData?: Record<string, unknown>;
}

export interface NormalizedJob {
  source: string;
  sourceJobId: string;
  fingerprint?: string;
  title: string;
  companyName: string;
  companyLogo?: string | null;
  description: string;
  location?: string | null;
  locations: string[];
  remoteType: RemoteType;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: SalaryPeriod | null;
  skills: string[];
  technologies: string[];
  jobUrl?: string | null;
  applyUrl?: string | null;
  postedAt?: Date | null;
  expiresAt?: Date | null;
  rawSource?: Record<string, unknown>;
}

export interface JobSourceResult {
  jobs: RawJob[];
}

export interface JobSourceHealth {
  healthy: boolean;
  message?: string;
}

export interface JobSource {
  id: string;
  name: string;
  searchJobs(params: JobSearchParams): Promise<JobSourceResult>;
  healthCheck?(): Promise<JobSourceHealth>;
}

export interface SourceReport {
  source: string;
  status: "success" | "error";
  count?: number;
  message?: string;
}
