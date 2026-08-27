import { IJob, RemoteType, EmploymentType, ExperienceLevel, SalaryPeriod } from "../models/Job";
import { JobMatchJobPayload } from "./jobMatchTypes";
import { limitDescription } from "./jobNormalization";

export const JOB_MATCH_MAX_DESCRIPTION_CHARS_DEFAULT = 10000;

export function getJobMatchMaxDescriptionChars(): number {
  const parsed = parseInt(
    process.env.JOB_MATCH_MAX_DESCRIPTION_CHARS || `${JOB_MATCH_MAX_DESCRIPTION_CHARS_DEFAULT}`,
    10
  );
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : JOB_MATCH_MAX_DESCRIPTION_CHARS_DEFAULT;
}

type MatchJobInput = Pick<
  IJob,
  | "title"
  | "companyName"
  | "description"
  | "locations"
  | "remoteType"
  | "employmentType"
  | "experienceLevel"
  | "salaryMin"
  | "salaryMax"
  | "salaryCurrency"
  | "salaryPeriod"
  | "skills"
  | "technologies"
  | "jobUrl"
>;

export function prepareMatchJob(job: MatchJobInput): JobMatchJobPayload {
  return {
    title: job.title,
    companyName: job.companyName,
    description: limitDescription(String(job.description || "").slice(0, getJobMatchMaxDescriptionChars())),
    locations: job.locations ?? [],
    remoteType: job.remoteType as RemoteType,
    employmentType: job.employmentType as EmploymentType,
    experienceLevel: job.experienceLevel as ExperienceLevel,
    salary:
      job.salaryMin != null ||
      job.salaryMax != null ||
      job.salaryCurrency != null ||
      job.salaryPeriod != null
        ? {
            min: job.salaryMin ?? null,
            max: job.salaryMax ?? null,
            currency: job.salaryCurrency ?? null,
            period: (job.salaryPeriod as SalaryPeriod | null) ?? null,
          }
        : null,
    skills: job.skills ?? [],
    technologies: job.technologies ?? [],
    jobUrl: job.jobUrl ?? null,
  };
}
