export interface JobMatch {
  _id: string;
  score: number;
  matchLevel: "strong_match" | "good_match" | "partial_match" | "weak_match";
  summary: string;
  matchingSkills: string[];
  missingSkills: string[];
  matchingTechnologies: string[];
  missingTechnologies: string[];
  experienceMatch: string;
  experienceGap: string;
  educationMatch: string;
  educationGap: string;
  locationMatch: string;
  remoteMatch: string;
  employmentTypeMatch: string;
  salaryMatch: string;
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
  recommendationReason: string;
  analyzedAt: string;
  job?: {
    _id?: string;
    title?: string;
    companyName?: string;
    source?: string;
  };
}
