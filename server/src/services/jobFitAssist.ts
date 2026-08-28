import { Types } from "mongoose";
import { Application } from "../models/Application";
import Job from "../models/Job";
import Profile from "../models/Profile";
import Skill from "../models/Skill";
import Experience from "../models/Experience";
import ProfessionalEvidence from "../models/ProfessionalEvidence";
import { AppError } from "../middleware/errorHandler";
import { ClaudeService } from "../integrations/claude/claude.service";
import { validateJobFitAssistOutput } from "../validators/jobFitAssist";

const claudeService = new ClaudeService();

const MAX_SKILLS = 60;
const MAX_EVIDENCE = 12;

function uniqueStrings(...arrays: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const arr of arrays) {
    for (const item of arr || []) {
      const key = item.trim().toLowerCase();
      if (item && !seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
  }
  return out;
}

async function buildCareerPayload(userId: string): Promise<{
  skills: string[];
  technologies: string[];
  yearsExperience: number | null;
  summary: string | null;
  roleRelevantKeywords: string[];
  professionalSummary: string | null;
  projectDomain: string | null;
  senioritySignals: string[];
}> {
  const userIdObj = new Types.ObjectId(userId);

  const [profile, skills, experiences, evidences] = await Promise.all([
    Profile.findOne({ user: userIdObj }).lean(),
    Skill.find({ user: userIdObj }).limit(MAX_SKILLS).sort({ createdAt: -1 }).lean(),
    Experience.find({ user: userIdObj }).sort({ startDate: 1 }).lean(),
    ProfessionalEvidence.find({ user: userIdObj, status: "ready" })
      .limit(MAX_EVIDENCE)
      .sort({ updatedAt: -1 })
      .lean(),
  ]);

  const skillNames = skills.map((s) => s.name);

  let totalYears = 0;
  for (const exp of experiences) {
    if (!exp.startDate) continue;
    const start = new Date(exp.startDate).getTime();
    const end = exp.endDate ? new Date(exp.endDate).getTime() : Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const years = (end - start) / (365.25 * 24 * 60 * 60 * 1000);
    if (exp.currentlyWorking) {
      totalYears = Math.max(totalYears, years);
    } else if (years > 0) {
      totalYears += years;
    }
  }
  const yearsExperience = experiences.length > 0 ? Math.round(totalYears * 10) / 10 : null;

  const evidenceSkills = evidences.flatMap((e) => e.technicalSkills);
  const evidenceTechnologies = evidences.flatMap((e) => e.technologies);
  const evidenceKeywords = evidences.flatMap((e) => e.roleRelevantKeywords);
  const evidenceSeniority = evidences.flatMap((e) => e.senioritySignals);
  const evidenceProjects = evidences.map((e) => e.projectName);
  const projectDomain = evidences.map((e) => e.projectDomain).filter(Boolean)[0] || null;
  const professionalSummary = evidences.map((e) => e.professionalSummary).filter(Boolean)[0] || null;

  const technologies = uniqueStrings(evidenceTechnologies);
  const projectKeywords = evidenceProjects.map((p) => p.trim()).filter(Boolean);

  return {
    skills: uniqueStrings(skillNames, evidenceSkills, evidenceKeywords, projectKeywords),
    technologies,
    yearsExperience,
    summary: profile?.summary ?? null,
    roleRelevantKeywords: evidenceKeywords,
    professionalSummary,
    projectDomain,
    senioritySignals: evidenceSeniority,
  };
}

export async function assistJobFit(userId: string, applicationId: string) {
  if (!Types.ObjectId.isValid(applicationId)) {
    throw new AppError("Application not found", 404);
  }

  const application = await Application.findOne({
    _id: applicationId,
    user: userId,
  });
  if (!application) {
    throw new AppError("Application not found", 404);
  }

  const job = await Job.findById(application.job).lean();
  if (!job) {
    throw new AppError("Linked job not found", 404);
  }

  const career = await buildCareerPayload(userId);

  const raw = await claudeService.assistJobFit({
    job: {
      title: job.title,
      companyName: job.companyName,
      description: job.description,
      skills: job.skills || [],
      technologies: job.technologies || [],
      experienceLevel: job.experienceLevel,
      location: job.location,
    },
    career: {
      skills: career.skills,
      technologies: career.technologies,
      yearsExperience: career.yearsExperience,
      summary: career.summary,
      roleRelevantKeywords: career.roleRelevantKeywords,
      professionalSummary: career.professionalSummary,
      projectDomain: career.projectDomain,
      senioritySignals: career.senioritySignals,
    },
  });

  const validation = validateJobFitAssistOutput(raw);
  if (!validation.success) {
    throw new AppError(validation.error, 422);
  }

  return {
    assessment: validation.data,
    advisoryOnly: true,
    statusUnchanged: true,
  };
}
