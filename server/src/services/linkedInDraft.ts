import { Types } from "mongoose";
import GitHubRepositoryModel from "../models/GitHubRepository";
import ProfessionalEvidence from "../models/ProfessionalEvidence";
import LinkedInDraft from "../models/LinkedInDraft";
import LinkedInConnection from "../models/LinkedInConnection";
import ProjectAnalysis from "../models/ProjectAnalysis";
import { ClaudeService } from "../integrations/claude/claude.service";
import { linkedInAssistResultSchema } from "../validators/linkedInAssist";
import { AppError } from "../middleware/errorHandler";
import { deriveProfessionalEvidence } from "./professionalEvidence";
import { LinkedInService } from "./linkedIn";

const claudeService = new ClaudeService();
const linkedInService = new LinkedInService();

export const MAX_DRAFTS_PER_EVIDENCE = 50;

interface AssistInput {
  userId: string;
  githubRepositoryId: number;
}

async function loadApprovedEvidence(
  userId: string,
  githubRepositoryId: number
) {
  const repository = await GitHubRepositoryModel.findOne({
    user: userId,
    githubRepositoryId,
  });
  if (!repository) {
    throw new AppError("Repository not imported", 404);
  }
  if (!repository.approvedForProfessionalUse) {
    throw new AppError(
      "Repository must be explicitly approved for professional use",
      403
    );
  }
  const evidence = await ProfessionalEvidence.findOne({
    user: userId,
    githubRepository: repository._id,
  });
  if (!evidence) {
    throw new AppError(
      "No professional evidence found. Generate professional evidence first.",
      404
    );
  }
  return { repository, evidence };
}

function safeEvidence(e: {
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
}) {
  return {
    projectName: e.projectName,
    professionalSummary: e.professionalSummary,
    problemSolved: e.problemSolved,
    contributionEvidence: e.contributionEvidence,
    technicalSkills: e.technicalSkills,
    architecturePractices: e.architecturePractices,
    measurableImpact: e.measurableImpact,
    technologies: e.technologies,
    proposedTalkingPoints: e.proposedTalkingPoints,
    suggestedPostAngles: e.suggestedPostAngles,
    evidenceReferences: e.evidenceReferences,
    roleRelevantKeywords: e.roleRelevantKeywords,
    projectDomain: e.projectDomain,
    senioritySignals: e.senioritySignals,
    status: e.status,
  };
}

/**
 * Explicitly user-triggered Claude assist. Returns validated suggestions only;
 * it NEVER persists a draft or mutates any application/job status.
 */
export async function assistLinkedInSuggestions({
  userId,
  githubRepositoryId,
}: AssistInput) {
  const { evidence } = await loadApprovedEvidence(userId, githubRepositoryId);

  const raw = await claudeService.assistLinkedInPost(safeEvidence(evidence));

  const validation = linkedInAssistResultSchema.safeParse(raw);
  if (!validation.success) {
    const details = validation.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`
    );
    throw new AppError(
      "Claude returned malformed LinkedIn suggestions",
      422
    );
  }

  return { suggestions: validation.data.suggestions };
}

async function loadApprovedEditor(
  userId: string,
  githubRepositoryId: number
) {
  const repository = await GitHubRepositoryModel.findOne({
    user: userId,
    githubRepositoryId,
  });
  if (!repository) {
    throw new AppError("Repository not imported", 404);
  }
  if (!repository.approvedForProfessionalUse) {
    throw new AppError(
      "Repository must be explicitly approved for professional use",
      403
    );
  }
  return repository;
}

/**
 * Returns the LinkedIn post content/preview for an approved repository without
 * persisting anything. The content is the latest saved draft body, or the AI
 * generated `linkedinDescription` from the latest project analysis when no
 * draft exists yet. Publishing information of the most recent draft is exposed
 * so the UI can show status/history.
 */
export async function getRepoLinkedInPreview(
  userId: string,
  githubRepositoryId: number
) {
  const repository = await loadApprovedEditor(userId, githubRepositoryId);

  const analysis = await ProjectAnalysis.findOne({
    user: userId,
    githubRepository: repository._id,
  }).sort({ analyzedAt: -1 });

  const evidence = await ProfessionalEvidence.findOne({
    user: userId,
    githubRepository: repository._id,
  });

  let draft: InstanceType<typeof LinkedInDraft> | null = null;
  if (evidence) {
    draft = await LinkedInDraft.findOne({
      user: userId,
      evidence: evidence._id,
    }).sort({ updatedAt: -1 });
  }

  return {
    approved: true,
    repository: {
      _id: repository._id,
      githubRepositoryId: repository.githubRepositoryId,
      name: repository.name,
      fullName: repository.fullName,
      approvedForProfessionalUse: repository.approvedForProfessionalUse,
      approvedAt: repository.approvedAt,
    },
    content: draft?.body || analysis?.linkedinDescription || "",
    draft: draft
      ? {
          _id: draft._id,
          status: draft.status,
          linkedinPostUrn: draft.linkedinPostUrn,
          linkedinPostUrl: draft.linkedinPostUrl,
          publishedAt: draft.publishedAt,
          publishErrorCode: draft.publishErrorCode,
          publishErrorMessageSafe: draft.publishErrorMessageSafe,
          updatedAt: draft.updatedAt,
        }
      : null,
  };
}

/**
 * Publishes explicitly provided (already user-edited) post content for an
 * approved repository. It reuses the existing draft + linkedIn publish
 * pipeline and never calls the AI: the caller supplies the exact text to post.
 * Pre-flight guarantees: ownership (404), repository approval (403), non-empty
 * content (400) and a connected LinkedIn account (400).
 */
export async function publishRepoContent(
  userId: string,
  githubRepositoryId: number,
  content: string
): Promise<Record<string, unknown>> {
  const repository = await loadApprovedEditor(userId, githubRepositoryId);

  const trimmed = (content || "").trim();
  if (!trimmed) {
    throw new AppError("Post content is required", 400);
  }

  const connection = await LinkedInConnection.findOne({
    user: userId,
    isActive: true,
  }).select("+encryptedAccessToken");
  if (!connection) {
    throw new AppError(
      "LinkedIn not connected. Connect your LinkedIn account first.",
      400
    );
  }

  const { evidence } = await deriveProfessionalEvidence({
    userId,
    githubRepositoryId,
  });

  const draft = await LinkedInDraft.create({
    user: userId,
    evidence: evidence._id,
    repository: repository._id,
    body: trimmed,
    status: "approved",
  });

  const result = await linkedInService.publishDraft(
    userId,
    String(draft._id)
  );

  if (!result.published) {
    const failed = result.draft as InstanceType<typeof LinkedInDraft>;
    const reason =
      failed.publishErrorMessageSafe ||
      failed.publishErrorCode ||
      "the LinkedIn API did not confirm the post";
    throw new AppError(`Post was not published. ${reason}`, 400);
  }

  const publishedDraft = result.draft as InstanceType<typeof LinkedInDraft>;
  const postUrn = result.postUrn as string | undefined;

  return {
    draft: publishedDraft,
    posted: true,
    postUrn: postUrn || null,
    postUrl: publishedDraft.linkedinPostUrl || null,
    message: "Post published to LinkedIn",
  };
}

export async function listDrafts(
  userId: string,
  query: { status?: string; page?: number; limit?: number }
) {
  const status = query.status;
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(Math.max(query.limit || 50, 1), 100);
  const filter: Record<string, unknown> = { user: userId };
  if (status) filter.status = status;

  const [drafts, total] = await Promise.all([
    LinkedInDraft.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("evidence", "projectName")
      .lean(),
    LinkedInDraft.countDocuments(filter),
  ]);

  return { drafts, total, page, limit };
}

export async function getDraft(userId: string, draftId: string) {
  if (!Types.ObjectId.isValid(draftId)) {
    throw new AppError("Invalid draft ID", 404);
  }
  const draft = await LinkedInDraft.findOne({
    _id: draftId,
    user: userId,
  });
  if (!draft) {
    throw new AppError("Draft not found", 404);
  }
  return { draft };
}

export async function createDraft(
  userId: string,
  input: {
    evidence: string;
    hook?: string;
    body?: string;
    hashtags?: string[];
  }
) {
  if (!Types.ObjectId.isValid(input.evidence)) {
    throw new AppError("Invalid evidence ID", 400);
  }
  const evidence = await ProfessionalEvidence.findOne({
    _id: input.evidence,
    user: userId,
  });
  if (!evidence) {
    throw new AppError("Professional evidence not found", 404);
  }

  const existingCount = await LinkedInDraft.countDocuments({
    user: userId,
    evidence: input.evidence,
  });
  if (existingCount >= MAX_DRAFTS_PER_EVIDENCE) {
    throw new AppError("Draft limit reached for this evidence", 400);
  }

  const draft = await LinkedInDraft.create({
    user: userId,
    evidence: input.evidence,
    hook: input.hook || "",
    body: input.body || "",
    hashtags: input.hashtags || [],
    status: "draft",
  });

  return { draft };
}

export async function updateDraft(
  userId: string,
  draftId: string,
  input: { hook?: string; body?: string; hashtags?: string[] }
) {
  if (!Types.ObjectId.isValid(draftId)) {
    throw new AppError("Invalid draft ID", 404);
  }
  const patch: Record<string, unknown> = {};
  if (input.hook !== undefined) patch.hook = input.hook;
  if (input.body !== undefined) patch.body = input.body;
  if (input.hashtags !== undefined) patch.hashtags = input.hashtags;

  const draft = await LinkedInDraft.findOneAndUpdate(
    { _id: draftId, user: userId },
    { $set: patch },
    { new: true, runValidators: true }
  );
  if (!draft) {
    throw new AppError("Draft not found", 404);
  }
  return { draft };
}

export async function approveDraft(userId: string, draftId: string) {
  if (!Types.ObjectId.isValid(draftId)) {
    throw new AppError("Invalid draft ID", 404);
  }
  const draft = await LinkedInDraft.findOne({ _id: draftId, user: userId });
  if (!draft) {
    throw new AppError("Draft not found", 404);
  }
  if (draft.status === "archived") {
    throw new AppError("Archived drafts cannot be approved", 400);
  }
  draft.status = "approved";
  await draft.save();
  return { draft };
}

export async function archiveDraft(userId: string, draftId: string) {
  if (!Types.ObjectId.isValid(draftId)) {
    throw new AppError("Invalid draft ID", 404);
  }
  const draft = await LinkedInDraft.findOneAndUpdate(
    { _id: draftId, user: userId },
    { $set: { status: "archived" } },
    { new: true, runValidators: true }
  );
  if (!draft) {
    throw new AppError("Draft not found", 404);
  }
  return { draft };
}
