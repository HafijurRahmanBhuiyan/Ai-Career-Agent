import { Types, FlattenMaps } from "mongoose";
import Profile from "../models/Profile";
import Skill from "../models/Skill";
import Experience from "../models/Experience";
import Education from "../models/Education";
import Project from "../models/Project";
import GitHubRepositoryModel from "../models/GitHubRepository";
import ProjectAnalysis, { IProjectAnalysis } from "../models/ProjectAnalysis";
import ProfessionalEvidence from "../models/ProfessionalEvidence";
import { JobMatchProfilePayload } from "./jobMatchTypes";

const MAX_PROJECTS = 10;
const MAX_EXPERIENCE = 15;
const MAX_EDUCATION = 10;
const MAX_SKILLS = 50;
const MAX_GITHUB_ANALYSES = 8;
const MAX_PROFESSIONAL_EVIDENCE = 12;

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
    },
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
