import GitHubRepositoryModel from "../models/GitHubRepository";
import ProjectAnalysis from "../models/ProjectAnalysis";
import ProfessionalEvidence from "../models/ProfessionalEvidence";
import { AppError } from "../middleware/errorHandler";
import { Types } from "mongoose";

interface EvidenceInput {
  userId: string;
  githubRepositoryId: number;
}

export function toSafeEvidence(evidence: InstanceType<typeof ProfessionalEvidence>) {
  return {
    _id: evidence._id,
    sourceProjectAnalysis: evidence.sourceProjectAnalysis,
    projectName: evidence.projectName,
    professionalSummary: evidence.professionalSummary,
    problemSolved: evidence.problemSolved,
    contributionEvidence: evidence.contributionEvidence,
    technicalSkills: evidence.technicalSkills,
    architecturePractices: evidence.architecturePractices,
    measurableImpact: evidence.measurableImpact,
    technologies: evidence.technologies,
    proposedTalkingPoints: evidence.proposedTalkingPoints,
    suggestedPostAngles: evidence.suggestedPostAngles,
    evidenceReferences: evidence.evidenceReferences,
    roleRelevantKeywords: evidence.roleRelevantKeywords,
    projectDomain: evidence.projectDomain,
    senioritySignals: evidence.senioritySignals,
    status: evidence.status,
    createdAt: evidence.createdAt,
    updatedAt: evidence.updatedAt,
  };
}

async function verifyRepository(userId: string, githubRepositoryId: number) {
  const repository = await GitHubRepositoryModel.findOne({
    user: userId,
    githubRepositoryId,
  });
  if (!repository) {
    throw new AppError("Repository not imported", 404);
  }
  if (!repository.approvedForProfessionalUse) {
    throw new AppError(
      "Repository must be explicitly approved for professional use before it can enter the professional-content workflow",
      403
    );
  }
  return repository;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    out.push(trimmed);
  }
  return out;
}

/**
 * Derive a professional-evidence artifact from an approved repository and its
 * existing (already Claude-validated) project analysis. This is deterministic:
 * it reorganizes persisted evidence rather than asking Claude to invent more.
 * Fields that are not evidenced by the repository (measurable impact, personal
 * contribution) are left empty ("unknown / not provided") so Claude never
 * fabricates them downstream.
 */
export async function deriveProfessionalEvidence({
  userId,
  githubRepositoryId,
}: EvidenceInput) {
  const repository = await verifyRepository(userId, githubRepositoryId);

  const analysis = await ProjectAnalysis.findOne({
    user: userId,
    githubRepository: repository._id,
  }).sort({ analyzedAt: -1 });

  const projectDomain = [
    repository.topics.join(", "),
    repository.language || "",
    repository.description || "",
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 200);

  const technicalSkills = uniqueStrings(
    analysis ? analysis.skillsDemonstrated : []
  );
  const technologies = uniqueStrings(
    [
      ...(analysis?.technologies ?? []),
      ...(analysis?.programmingLanguages ?? []),
      ...(analysis?.frameworks ?? []),
      ...(analysis?.databases ?? []),
      ...(analysis?.tools ?? []),
      ...(analysis?.cloudServices ?? []),
    ]
  );
  const architecturePractices = uniqueStrings([
    ...(analysis?.developmentHighlights ?? []),
    analysis?.architecture ? analysis.architecture : null,
  ] as string[])
    .filter(Boolean);

  const proposedTalkingPoints = uniqueStrings([
    ...(analysis?.keyFeatures ?? []),
    ...(analysis?.developmentHighlights ?? []),
  ]);
  const suggestedPostAngles = uniqueStrings(
    (analysis?.linkedinDescription ? [analysis.linkedinDescription] : []) as string[]
  );

  const roleRelevantKeywords = uniqueStrings([
    ...(analysis?.skillsDemonstrated ?? []),
    ...(analysis?.technologies ?? []),
    ...(analysis?.programmingLanguages ?? []),
    ...(analysis?.frameworks ?? []),
    ...(analysis?.databases ?? []),
    ...(analysis?.tools ?? []),
    ...(analysis?.cloudServices ?? []),
    analysis?.developerRole || "",
  ]);

  const senioritySignals = uniqueStrings([
    analysis?.difficultyLevel || "",
    analysis?.developerRole || "",
  ]);

  const evidenceReferences = uniqueStrings([
    repository.htmlUrl || "",
    analysis ? String(analysis._id) : "",
  ]);

  const professionalSummary = analysis?.projectSummary || "";
  const problemSolved = analysis?.problemStatement || "";
  const measurableImpact = ""; // unknown / not provided
  const contributionEvidence = ""; // unknown / not provided

  const hasCore =
    Boolean(professionalSummary) &&
    (technicalSkills.length > 0 || technologies.length > 0);
  const status = hasCore ? "ready" : "needs_evidence";

  const existing = await ProfessionalEvidence.findOne({
    user: userId,
    githubRepository: repository._id,
  });

  const data = {
    user: new Types.ObjectId(userId),
    githubRepository: repository._id,
    sourceProjectAnalysis: analysis ? analysis._id : null,
    projectName: repository.name,
    professionalSummary,
    problemSolved,
    contributionEvidence,
    technicalSkills,
    architecturePractices,
    measurableImpact,
    technologies,
    proposedTalkingPoints,
    suggestedPostAngles,
    evidenceReferences,
    roleRelevantKeywords,
    projectDomain: projectDomain.slice(0, 200),
    senioritySignals,
    status,
  };

  const saved = existing
    ? await ProfessionalEvidence.findOneAndUpdate(
        { _id: existing._id, user: userId },
        { ...data },
        { new: true, runValidators: true }
      )
    : await ProfessionalEvidence.create(data);

  if (!saved) {
    throw new AppError("Failed to save professional evidence", 500);
  }

  return { evidence: toSafeEvidence(saved), derivedFromExistingAnalysis: Boolean(analysis) };
}

export async function getProfessionalEvidence({
  userId,
  githubRepositoryId,
}: EvidenceInput) {
  const repository = await GitHubRepositoryModel.findOne({
    user: userId,
    githubRepositoryId,
  });
  if (!repository) {
    throw new AppError("Repository not imported", 404);
  }

  const evidence = await ProfessionalEvidence.findOne({
    user: userId,
    githubRepository: repository._id,
  });

  return { evidence: evidence ? toSafeEvidence(evidence) : null };
}
