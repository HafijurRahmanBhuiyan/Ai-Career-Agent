export const CHECKLIST_KEYS = [
  "resume_reviewed",
  "job_description_reviewed",
  "company_researched",
  "star_stories_prepared",
  "technical_topics_prepared",
  "behavioral_topics_prepared",
  "interviewer_questions_prepared",
] as const;

export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export interface InterviewChecklistItem {
  key: ChecklistKey;
  label: string;
  completed: boolean;
  completedAt?: string | null;
}

export interface InterviewPreparation {
  application?: string;
  notes?: string | null;
  goals?: string[];
  talkingPoints?: string[];
  questionsToAsk?: string[];
  companyResearchNotes?: string | null;
  rolePreparationNotes?: string | null;
  checklist: InterviewChecklistItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PrepAssistSuggestions {
  suggestedGoals: string[];
  suggestedTalkingPoints: string[];
  suggestedQuestionsToAsk: string[];
  suggestedChecklistHighlights: string[];
}
