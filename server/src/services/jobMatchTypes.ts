export interface JobMatchProfilePayload {
  profile: {
    fullName?: string | null;
    headline?: string | null;
    summary?: string | null;
    location?: string | null;
    preferredRoles: string[];
    preferredLocations: string[];
    workPreference?: string | null;
    salaryExpectation?: {
      min?: number | null;
      max?: number | null;
      currency?: string | null;
    } | null;
  };
  skills: Array<{
    name: string;
    category?: string;
    proficiency?: string;
  }>;
  experience: Array<{
    company: string;
    position: string;
    description?: string | null;
    durationYears?: number | null;
    currentlyWorking: boolean;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    field?: string | null;
    grade?: string | null;
  }>;
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
    features: string[];
    role?: string | null;
    githubUrl?: string | null;
    liveUrl?: string | null;
  }>;
  githubAnalysis: Array<{
    projectSummary: string;
    technologies: string[];
    keyFeatures: string[];
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  }>;
  professionalEvidence: Array<{
    projectName: string;
    professionalSummary: string;
    technicalSkills: string[];
    technologies: string[];
    roleRelevantKeywords: string[];
    projectDomain: string;
    senioritySignals: string[];
  }>;
}

export interface JobMatchJobPayload {
  title: string;
  companyName: string;
  description: string;
  locations: string[];
  remoteType: string;
  employmentType: string;
  experienceLevel: string;
  salary?: {
    min?: number | null;
    max?: number | null;
    currency?: string | null;
    period?: string | null;
  } | null;
  skills: string[];
  technologies: string[];
  jobUrl?: string | null;
}
