import { Types, FlattenMaps } from "mongoose";
import Profile from "../models/Profile";
import Skill from "../models/Skill";
import Experience from "../models/Experience";
import Education from "../models/Education";
import Project from "../models/Project";
import GitHubRepositoryModel from "../models/GitHubRepository";
import ProjectAnalysis, { IProjectAnalysis } from "../models/ProjectAnalysis";
import ProfessionalEvidence from "../models/ProfessionalEvidence";
import Resume from "../models/Resume";
import { JobMatchProfilePayload } from "./jobMatchTypes";
import { ResumeDerivedEvidence } from "./resumeTypes";

const MAX_PROJECTS = 10;
const MAX_EXPERIENCE = 15;
const MAX_EDUCATION = 10;
const MAX_SKILLS = 50;
const MAX_GITHUB_ANALYSES = 8;
const MAX_PROFESSIONAL_EVIDENCE = 12;
const MAX_RESUME_EVIDENCE = 3;

function coerceNull<T>(value: T | undefined | null): T | null {
  return typeof value === "undefined" ? null : (value as T | null);
}

export interface PreparedMatchProfile {
  payload: JobMatchProfilePayload;
  completeness: {
    hasProfile: boolean;
    hasSkills: boolean;
    hasExperience: boolean;
    hasEducation: boolean;
    hasProjects: boolean;
    hasGithubAnalysis: boolean;
    hasResume: boolean;
  };
}

export async function prepareMatchProfile(
  userId: string
): Promise<PreparedMatchProfile> {
  const userIdObj = new Types.ObjectId(userId);

  const [
    profile,
    skills,
    experience,
    education,
    projects,
    githubRepositories,
    professionalEvidences,
    resumes,
    resumeDerived,
  ] = await Promise.all([
    Profile.findOne({ user: userIdObj }).lean(),
    Skill.find({ user: userIdObj }).limit(MAX_SKILLS).sort({ createdAt: -1 }).lean(),
    Experience.find({ user: userIdObj })
      .limit(MAX_EXPERIENCE)
      .sort({ startDate: -1 })
      .lean(),
    Education.find({ user: userIdObj }).limit(MAX_EDUCATION).sort({ startDate: -1 }).lean(),
    Project.find({ user: userIdObj }).limit(MAX_PROJECTS).sort({ createdAt: -1 }).lean(),
    GitHubRepositoryModel.find({ user: userIdObj })
      .select("_id")
      .limit(MAX_GITHUB_ANALYSES)
      .lean(),
    ProfessionalEvidence.find({ user: userIdObj, status: "ready" })
      .limit(MAX_PROFESSIONAL_EVIDENCE)
      .sort({ updatedAt: -1 })
      .lean(),
    loadResumeEvidence(userIdObj),
    loadResumeDerivedEvidence(userIdObj),
  ]);

  let analyses: Array<FlattenMaps<IProjectAnalysis>> = [];
  if (githubRepositories.length > 0) {
    const repoIds = githubRepositories.map((r) => r._id);
    analyses = await ProjectAnalysis.find({
      user: userIdObj,
      githubRepository: { $in: repoIds },
    })
      .sort({ analyzedAt: -1 })
      .limit(MAX_GITHUB_ANALYSES)
      .lean();
  }

    const payload: JobMatchProfilePayload = {
    profile: {
      fullName: profile?.fullName ?? null,
      headline: profile?.headline ?? null,
      summary: profile?.summary ?? null,
      location: profile?.location ?? null,
      preferredRoles: profile?.preferredRoles ?? [],
      preferredLocations: profile?.preferredLocations ?? [],
      workPreference: profile?.workPreference || null,
      salaryExpectation: profile?.salaryExpectation
        ? {
            min: coerceNull(profile.salaryExpectation.min),
            max: coerceNull(profile.salaryExpectation.max),
            currency: coerceNull(profile.salaryExpectation.currency),
          }
        : null,
      jobSearchPreferences: profile?.jobSearchPreferences
        ? {
            roles: profile.jobSearchPreferences.roles ?? [],
            locations: profile.jobSearchPreferences.locations ?? [],
            remote: coerceNull(profile.jobSearchPreferences.remote),
            experienceLevel: coerceNull(profile.jobSearchPreferences.experienceLevel),
            salaryMinimum: coerceNull(profile.jobSearchPreferences.salaryMinimum),
          }
        : null,
    },
    skills: skills.map((s) => ({
      name: s.name,
      category: s.category,
      proficiency: s.proficiency,
    })),
    experience: experience.map((e) => ({
      company: e.company,
      position: e.position,
      description: e.description ?? null,
      durationYears: computeDurationYears(e.startDate, e.endDate),
      currentlyWorking: e.currentlyWorking,
    })),
    education: education.map((ed) => ({
      degree: ed.degree,
      institution: ed.institution,
      field: ed.field ?? null,
      grade: ed.grade ?? null,
    })),
    projects: projects.map((p) => ({
      name: p.name,
      description: p.description,
      technologies: p.technologies ?? [],
      features: p.features ?? [],
      role: p.role ?? null,
      githubUrl: p.githubUrl ?? null,
      liveUrl: p.liveUrl ?? null,
    })),
    githubAnalysis: analyses.map((a) => ({
      projectSummary: a.projectSummary,
      technologies: a.technologies ?? [],
      keyFeatures: a.keyFeatures ?? [],
      strengths: a.skillsDemonstrated ?? [],
      weaknesses: a.developmentHighlights ?? [],
      recommendations: a.suggestedTags ?? [],
    })),
    professionalEvidence: professionalEvidences.map((e) => ({
      projectName: e.projectName,
      professionalSummary: e.professionalSummary,
      technicalSkills: e.technicalSkills ?? [],
      technologies: e.technologies ?? [],
      roleRelevantKeywords: e.roleRelevantKeywords ?? [],
      projectDomain: e.projectDomain,
      senioritySignals: e.senioritySignals ?? [],
    })),
    resumeEvidence: resumes,
    resumeDerived,
  };

  return {
    payload,
    completeness: {
      hasProfile: !!profile,
      hasSkills: skills.length > 0,
      hasExperience: experience.length > 0,
      hasEducation: education.length > 0,
      hasProjects: projects.length > 0,
      hasGithubAnalysis: analyses.length > 0,
      hasResume: resumes.length > 0,
    },
  };
}

/**
 * (Phase 2, Step 2) Load the user's active CV/resume as lightweight evidence for
 * the AI job matcher. Only public metadata (title, file name, version, and
 * whether a file is attached) is returned — the private `fileUrl` is deliberately
 * excluded. CV and Resume share the same underlying Resume model, so "active
 * resume" is the current CV. Active resumes are preferred; if none is flagged
 * active, the most recently updated resume is used.
 */
async function loadResumeEvidence(
  userId: Types.ObjectId
): Promise<Array<{ title: string; fileName: string; version: number; hasFile: boolean }>> {
  const active = await Resume.find({ user: userId, isActive: true })
    .sort({ updatedAt: -1 })
    .limit(MAX_RESUME_EVIDENCE)
    .select("title fileName version fileUrl updatedAt")
    .lean();

  if (active.length > 0) {
    return active.map((r) => ({
      title: r.title,
      fileName: r.fileName,
      version: r.version,
      hasFile: Boolean(r.fileUrl),
    }));
  }

  const latest = await Resume.find({ user: userId })
    .sort({ updatedAt: -1 })
    .limit(MAX_RESUME_EVIDENCE)
    .select("title fileName version fileUrl updatedAt")
    .lean();

  return latest.map((r) => ({
    title: r.title,
    fileName: r.fileName,
    version: r.version,
    hasFile: Boolean(r.fileUrl),
  }));
}

/**
 * (Phase 2, Step 3) Load the active resume's structured, resume-derived evidence
 * as a SUPPLEMENTARY matching block. It is derived from the resume document
 * content (never the raw text, which stays server-side) and only the validated
 * structured fields are forwarded to the matcher. It never overwrites the
 * trusted structured profile data.
 */
async function loadResumeDerivedEvidence(
  userId: Types.ObjectId
): Promise<JobMatchProfilePayload["resumeDerived"]> {
  const baseQuery: Record<string, unknown> = { user: userId, evidence: { $exists: true } };
  const projection = { title: 1, evidence: 1, isActive: 1, updatedAt: 1 };

  let resume = await Resume.findOne({ ...baseQuery, isActive: true })
    .sort({ updatedAt: -1 })
    .select(projection)
    .lean();

  if (!resume) {
    resume = await Resume.findOne(baseQuery)
      .sort({ updatedAt: -1 })
      .select(projection)
      .lean();
  }

  if (!resume || !resume.evidence) return null;

  const evidence: ResumeDerivedEvidence = resume.evidence as ResumeDerivedEvidence;
  const skills = evidence.skills ?? [];
  const technologies = evidence.technologies ?? [];
  const roles = evidence.roles ?? [];
  const employers = evidence.employers ?? [];
  const projects = evidence.projects ?? [];
  const achievements = evidence.achievements ?? [];
  const certifications = evidence.certifications ?? [];
  const domains = evidence.domains ?? [];

  const hasSignal =
    skills.length > 0 ||
    technologies.length > 0 ||
    roles.length > 0 ||
    employers.length > 0 ||
    projects.length > 0 ||
    achievements.length > 0 ||
    certifications.length > 0 ||
    domains.length > 0 ||
    (evidence.yearsExperience ?? null) != null ||
    (evidence.education ?? []).length > 0;

  if (!hasSignal) return null;

  return {
    summary: evidence.summary ?? null,
    skills,
    technologies,
    roles,
    employers,
    yearsExperience: evidence.yearsExperience ?? null,
    projects,
    achievements,
    education: (evidence.education ?? []).map((e) => ({
      degree: e.degree ?? null,
      institution: e.institution ?? null,
      field: e.field ?? null,
    })),
    certifications,
    domains,
    source: evidence.extraction?.source === "ai" ? "ai" : "deterministic",
  };
}

function computeDurationYears(
  startDate: Date,
  endDate?: Date | null
): number | null {
  if (!startDate) return null;
  const start = new Date(startDate).getTime();
  const end = endDate ? new Date(endDate).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Number(((end - start) / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1)));
}
