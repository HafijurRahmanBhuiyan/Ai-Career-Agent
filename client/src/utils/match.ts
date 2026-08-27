import { JobMatch } from "../types/jobMatch";

export const matchLevelLabel: Record<string, string> = {
  strong_match: "Strong Match",
  good_match: "Good Match",
  partial_match: "Partial Match",
  weak_match: "Weak Match",
};

export function scoreColor(score: number): string {
  if (score >= 90) return "text-emerald-600";
  if (score >= 75) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

export function scoreRingColor(score: number): string {
  if (score >= 90) return "text-emerald-500";
  if (score >= 75) return "text-green-500";
  if (score >= 60) return "text-amber-500";
  return "text-red-500";
}

export function matchLevelBadgeClass(level: string): string {
  if (level === "strong_match") return "bg-emerald-50 text-emerald-700";
  if (level === "good_match") return "bg-green-50 text-green-700";
  if (level === "partial_match") return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

export function recommendationLabel(rec: string): string {
  if (rec === "apply") return "Apply";
  if (rec === "maybe") return "Maybe";
  return "Skip";
}

export function formatAnalyzedDate(date?: string): string {
  if (!date) return "Unknown";
  const d = new Date(date);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function isMeaningfulMatch(m: JobMatch): boolean {
  return typeof m.score === "number";
}
