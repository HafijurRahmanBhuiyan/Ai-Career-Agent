import { JobMatchProfilePayload, JobMatchJobPayload } from "./jobMatchTypes";
import { MatchLevel } from "../models/JobMatch";
import { matchLevelFromScore } from "../validators/jobMatch";

export interface DeterministicMatchSegments {
  skills: { earned: number; possible: number; note: string };
  technologies: { earned: number; possible: number; note: string };
  role: { earned: number; possible: number; note: string };
  location: { earned: number; possible: number; note: string };
  remote: { earned: number; possible: number; note: string };
  employment: { earned: number; possible: number; note: string };
  experience: { earned: number; possible: number; note: string };
}

export interface DeterministicMatchResult {
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
  recommendation: "apply" | "maybe" | "skip";
  recommendationReason: string;
  explanation: string[];
  segments: DeterministicMatchSegments;
}

function norm(value: string | null | undefined): string {
  return (value || "").toLowerCase().trim();
}

function tokenize(values: string[]): Set<string> {
  const set = new Set<string>();
  for (const v of values) {
    for (const part of norm(v).split(/[^a-z0-9.+]+/)) {
      if (part.length > 0) set.add(part);
    }
  }
  return set;
}

function overlap(user: string[], job: string[]): string[] {
  const jobTokens = new Set<string>();
  for (const j of job) {
    for (const part of norm(j).split(/[^a-z0-9.+]+/)) {
      if (part.length > 1) jobTokens.add(part);
    }
  }
  return user.filter((s) =>
    jobTokens.has(norm(s))
  );
}

function missingFrom(user: string[], job: string[]): string[] {
  const userNorm = new Set(user.map(norm));
  return job.filter((j) => !userNorm.has(norm(j)));
}

function seniorityWeight(level: string | undefined): number {
  const map: Record<string, number> = {
    entry: 1,
    junior: 2,
    mid: 3,
    senior: 4,
    lead: 5,
    manager: 5,
  };
  return map[norm(level)] ?? 3;
}

export function computeDeterministicMatch(
  profile: JobMatchProfilePayload,
  job: JobMatchJobPayload
): DeterministicMatchResult {
  const userSkills = profile.skills.map((s) => s.name);
  const roleKeywords = [
    ...profile.professionalEvidence.flatMap((e) => e.roleRelevantKeywords ?? []),
    ...profile.githubAnalysis.flatMap((g) => g.keyFeatures ?? []),
  ];

  const matchingSkills = overlap(userSkills, job.skills);
  const missingSkills = missingFrom(userSkills, job.skills);
  const matchingTechnologies = overlap(userSkills, job.technologies);
  const userTechTokens = tokenize([
    ...profile.skills.map((s) => s.name),
    ...profile.projects.flatMap((p) => p.technologies ?? []),
    ...profile.professionalEvidence.flatMap((e) => e.technologies ?? []),
  ]);
  const missingTechnologies = job.technologies.filter(
    (t) => !userTechTokens.has(norm(t))
  );

  const profileRoles = [
    ...(profile.profile?.preferredRoles ?? []),
    ...profile.experience.map((e) => e.position),
  ].filter(Boolean);
  const profileRoleTokens = tokenize(profileRoles);
  const jobTitleTokens = tokenize([job.title]);
  const roleTokenIntersection = [...profileRoleTokens].filter((t) =>
    jobTitleTokens.has(t)
  );
  const roleHit = roleTokenIntersection.length > 0;
  const keywordHit = roleKeywords.some((k) => norm(job.title).includes(norm(k)));

  const segments: DeterministicMatchSegments = {
    skills: {
      earned: matchingSkills.length,
      possible: Math.max(1, job.skills.length),
      note: matchingSkills.length > 0
        ? `Matches ${matchingSkills.length} of ${job.skills.length} listed skills`
        : "No listed skills overlap with your profile",
    },
    technologies: {
      earned: matchingTechnologies.length,
      possible: Math.max(1, job.technologies.length),
      note: "Based on your skills and project technologies",
    },
    role: {
      earned: roleHit || keywordHit ? 1 : 0,
      possible: 1,
      note: roleHit || keywordHit
        ? "Job title aligns with your roles and project keywords"
        : "Job title does not clearly match your roles",
    },
    location: {
      earned: 0,
      possible: 1,
      note: "No location comparison performed",
    },
    remote: {
      earned: 0,
      possible: 1,
      note: "No remote comparison performed",
    },
    employment: {
      earned: 0,
      possible: 1,
      note: "No employment type comparison performed",
    },
    experience: {
      earned: 0,
      possible: 1,
      note: "No direct experience comparison performed",
    },
  };

  if (job.locations && job.locations.length > 0) {
    const prefLoc = profile.profile?.preferredLocations ?? [];
    const locMatch = job.locations.some((l) =>
      prefLoc.some((p) => norm(p) === norm(l) || norm(l).includes(norm(p)) || norm(p).includes(norm(l)))
    );
    const remoteAllowed = norm(job.remoteType) === "remote";
    segments.location = {
      earned: locMatch ? 1 : 0,
      possible: 1,
      note: locMatch
        ? "Job location matches your preferred locations"
        : remoteAllowed
        ? "No preferred location match, but the role is remote"
        : "Job location does not match your preferred locations",
    };
  }

  if (job.remoteType) {
    const prefRemote = norm(profile.profile?.workPreference ?? "");
    const remoteMatch =
      norm(job.remoteType) === "remote" ||
      (norm(job.remoteType) === "hybrid" &&
        (prefRemote === "remote" || prefRemote === "hybrid"));
    segments.remote = {
      earned: remoteMatch ? 1 : 0,
      possible: 1,
      note: remoteMatch
        ? "Remote arrangement matches your work preference"
        : "Remote arrangement may not match your preference",
    };
  }

  if (job.employmentType) {
    const prefEmployment = profile.profile?.workPreference ?? "";
    const employmentMatch =
      norm(job.employmentType) === norm(prefEmployment) ||
      norm(job.employmentType) === "full-time" ||
      prefEmployment === "";
    segments.employment = {
      earned: employmentMatch ? 1 : 0,
      possible: 1,
      note: employmentMatch
        ? "Employment type aligns with your expectations"
        : "Employment type may differ from your expectations",
    };
  }

  if (job.experienceLevel) {
    const userExp = profile.experience.reduce((acc, e) => {
      const p = profile.profile?.preferredRoles ?? [];
      const isRelevant = p.some((r) => r.toLowerCase().includes(e.position.toLowerCase()));
      if (!isRelevant) return acc;
      return Math.max(acc, e.durationYears ?? 0);
    }, 0);
    const target = seniorityWeight(job.experienceLevel);
    const experienceMatch = userExp >= target;
    segments.experience = {
      earned: experienceMatch ? 1 : 0,
      possible: 1,
      note: userExp > 0
        ? experienceMatch
          ? `Your ${userExp.toFixed(1)} yrs relevant experience fits the ${job.experienceLevel} level`
          : `Your ${userExp.toFixed(1)} yrs relevant experience may fall short of the ${job.experienceLevel} level`
        : "No relevant experience measured",
    };
  }

  const weights: Record<keyof DeterministicMatchSegments, number> = {
    skills: 0.32,
    technologies: 0.18,
    role: 0.2,
    location: 0.08,
    remote: 0.1,
    employment: 0.06,
    experience: 0.06,
  };

  let total = 0;
  for (const key of Object.keys(segments) as (keyof DeterministicMatchSegments)[]) {
    const seg = segments[key];
    if (seg.possible > 0) {
      total += (seg.earned / seg.possible) * weights[key];
    }
  }

  const score = Math.round(Math.min(100, total * 100));
  const matchLevel = matchLevelFromScore(score);

  const salaryMatch =
    job.salary?.min != null && profile.profile?.salaryExpectation?.max != null
      ? job.salary.min <= profile.profile.salaryExpectation.max
        ? "Salary range is within your expectation"
        : "Salary range is above your upper expectation"
      : "No salary comparison performed";

  const appliedTarget = job.skills.length > 0
    ? matchingSkills.length / job.skills.length
    : 0;

  let recommendation: "apply" | "maybe" | "skip" = "maybe";
  if (score >= 75 || appliedTarget >= 0.5) recommendation = "apply";
  else if (score < 50) recommendation = "skip";

  const explanation = [
    ...(matchingSkills.length > 0
      ? [`You match ${matchingSkills.length} of ${job.skills.length} listed skills: ${matchingSkills.slice(0, 6).join(", ")}${matchingSkills.length > 6 ? ", …" : ""}.`]
      : ["Your skills do not overlap with any listed skills for this role."]),
    ...(missingSkills.length > 0
      ? [`Consider strengthening: ${missingSkills.slice(0, 5).join(", ")}${missingSkills.length > 5 ? ", …" : ""}.`]
      : ["You cover every listed skill."]),
    ...(matchingTechnologies.length > 0
      ? [`Technologies matching your profile: ${matchingTechnologies.slice(0, 6).join(", ")}.`]
      : ["No technology overlap detected with your profile."]),
    ...(roleHit || keywordHit
      ? ["The role aligns with your preferred roles and project evidence."]
      : ["The role does not clearly align with your preferred roles."]),
  ];

  const recommendationReason = [
    `Deterministic score ${score}/100 (${matchLevel.replace(/_/g, " ")}).`,
    ...(score >= 75 ? ["Strong overall alignment — worth applying."] : []),
    ...(score >= 50 && score < 75 ? ["Moderate alignment — apply if the role interests you."] : []),
    ...(score < 50 ? ["Weak alignment — consider a more targeted role."] : []),
  ].join(" ");

  return {
    score,
    matchLevel,
    matchingSkills,
    missingSkills,
    matchingTechnologies,
    missingTechnologies,
    experienceMatch: segments.experience.note,
    experienceGap: missingSkills.slice(0, 5).join(", ") || "None significant",
    locationMatch: segments.location.note,
    remoteMatch: segments.remote.note,
    employmentTypeMatch: segments.employment.note,
    salaryMatch,
    recommendation,
    recommendationReason,
    explanation,
    segments,
  };
}
