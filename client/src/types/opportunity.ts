export interface OpportunityJob {
  _id: string;
  source: string;
  sourceJobId: string;
  title: string;
  companyName: string;
  companyLogo?: string | null;
  description: string;
  location?: string | null;
  locations: string[];
  remoteType: string;
  employmentType: string;
  experienceLevel: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
  skills: string[];
  technologies: string[];
  jobUrl?: string | null;
  applyUrl?: string | null;
  postedAt?: string | null;
  expiresAt?: string | null;
}

export type MatchLevel =
  | "strong_match"
  | "good_match"
  | "partial_match"
  | "weak_match";

export interface OpportunityMatch {
  score: number;
  matchLevel: MatchLevel;
  matchingSkills: string[];
  missingSkills: string[];
  matchingTechnologies: string[];
  missingTechnologies: string[];
  experienceMatch: string;
  experienceGap: string;
  locationMatch: string;
  remoteMatch: string;
  employmentTypeMatch: string;
  salaryMatch: string;
  educationMatch: string;
  recommendation: "apply" | "maybe" | "skip";
  recommendationReason: string;
  explanation: string[];
}

export interface ApplyCapability {
  capability: "external_url" | "supported_api" | "manual_required";
  handoffUrl: string | null;
  label: string;
}

export interface Opportunity {
  job: OpportunityJob;
  match: OpportunityMatch;
  applyCapability: ApplyCapability;
  alreadyApplied: boolean;
  applicationStatus: import("./application").ApplicationStatus | null;
}

export interface OpportunityFeedResponse {
  opportunities: Opportunity[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  profileComplete: {
    hasSkills: boolean;
    hasExperience: boolean;
    hasProfile: boolean;
  };
}
