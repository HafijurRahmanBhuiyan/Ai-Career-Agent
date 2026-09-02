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
    jobSearchPreferences?: {
      roles: string[];
      locations: string[];
      remote?: string | null;
      experienceLevel?: string | null;
      salaryMinimum?: number | null;
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
  /**
   * (Phase 2, Step 2) Active CV/resume metadata evidence supplied to the AI.
   * Resumes in this system are metadata records (no parsed document content is
   * stored). Only non-private signal is exposed: that a current resume exists,
   * its human title, file name and version. The private `fileUrl` is never
   * included here so document storage/public URLs never reach the AI. CV and
   * Resume are the same underlying concept (a single Resume model).
   */
  resumeEvidence: Array<{
    title: string;
    fileName: string;
    version: number;
    hasFile: boolean;
  }>;
  /**
   * (Phase 2, Step 3) Structured evidence derived from the active resume's
   * document content (summary, skills, technologies, roles, employers,
   * yearsExperience, projects, achievements, education, certifications,
   * domains). SUPPLEMENTARY to the trusted profile fields above — it never
   * overwrites them. Empty arrays carry the same signal as "no evidence".
   */
  resumeDerived?: {
    summary?: string | null;
    skills: string[];
    technologies: string[];
    roles: string[];
    employers: string[];
    yearsExperience?: number | null;
    projects: string[];
    achievements: string[];
    education: Array<{
      degree?: string | null;
      institution?: string | null;
      field?: string | null;
    }>;
    certifications: string[];
    domains: string[];
    source: "deterministic" | "ai";
  } | null;
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
  /**
   * An explicit, structured education requirement for the role (degree and/or
   * field). Optional and conservative: when omitted, education matching is
   * treated as unknown/neutral and never penalizes the job. Currently no job
   * source/model populates this (see Phase 1 Step 5 report).
   */
  educationRequirement?: {
    degree?: string | null;
    field?: string | null;
  } | null;
  /**
   * (Phase 2, Step 3) Structured job requirements extracted from the real job
   * description (required/preferred/technologies/experience/education/location/
   * remote/employment/salary/other). Additive, populated lazily; when absent the
   * description remains the source and matching never penalizes on unknowns.
   */
  requirements?: {
    required: string[];
    preferred: string[];
    technologies: string[];
    experience?: {
      years?: number | null;
      level?: string | null;
    } | null;
    education?: {
      degree?: string | null;
      field?: string | null;
    } | null;
    location?: { cities: string[] } | null;
    remote?: { type?: "remote" | "hybrid" | "onsite" | null } | null;
    employment: string[];
    salary?: {
      min?: number | null;
      max?: number | null;
      currency?: string | null;
      period?: string | null;
    } | null;
    other: string[];
    unavailable: boolean;
  } | null;
}
