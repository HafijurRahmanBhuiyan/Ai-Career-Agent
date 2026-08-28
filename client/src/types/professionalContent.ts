export interface ImportedRepo {
  _id: string;
  githubRepositoryId: number;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  htmlUrl: string;
  approvedForProfessionalUse: boolean;
  approvedAt: string | null;
  importedAt?: string;
}

export interface ProfessionalEvidence {
  _id: string;
  sourceProjectAnalysis: string | null;
  projectName: string;
  professionalSummary: string;
  problemSolved: string;
  contributionEvidence: string;
  technicalSkills: string[];
  architecturePractices: string[];
  measurableImpact: string;
  technologies: string[];
  proposedTalkingPoints: string[];
  suggestedPostAngles: string[];
  evidenceReferences: string[];
  roleRelevantKeywords: string[];
  projectDomain: string;
  senioritySignals: string[];
  status: "ready" | "needs_evidence";
  createdAt: string;
  updatedAt: string;
}

export interface LinkedInSuggestion {
  hook: string;
  body: string;
  hashtags: string[];
}

export type LinkedInDraftStatus =
  | "draft"
  | "reviewed"
  | "approved"
  | "publishing"
  | "published"
  | "publish_failed"
  | "archived";

export interface LinkedInDraft {
  _id: string;
  evidence: string | { _id: string; projectName?: string };
  hook: string;
  body: string;
  hashtags: string[];
  status: LinkedInDraftStatus;
  publishedAt: string | null;
  linkedinPostUrn: string | null;
  lastPublishAttemptAt: string | null;
  publishErrorCode: string | null;
  publishErrorMessageSafe: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinkedInDraftList {
  drafts: LinkedInDraft[];
  total: number;
  page: number;
  limit: number;
}

export interface LinkedInConnection {
  connected: boolean;
  linkedin?: {
    memberId: string;
    profileUrn: string;
    displayName: string | null;
    isActive: boolean;
    connectedAt: string | null;
    tokenExpiry: string | null;
    lastUsedAt: string | null;
  };
}
