import { Request, Response, NextFunction } from "express";
import {
  deriveProfessionalEvidence,
  getProfessionalEvidence,
  toSafeEvidence,
} from "../services/professionalEvidence";
import {
  assistLinkedInSuggestions,
  listDrafts,
  getDraft,
  createDraft,
  updateDraft,
  approveDraft,
  archiveDraft,
} from "../services/linkedInDraft";
import ProfessionalEvidence from "../models/ProfessionalEvidence";
import GitHubRepositoryModel from "../models/GitHubRepository";
import { AppError } from "../middleware/errorHandler";
import { LinkedInService } from "../services/linkedIn";

const linkedInService = new LinkedInService();

function parseRepoId(raw: string | string[] | undefined): number {
  const val = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(val || "", 10);
}

function parseDraftId(raw: string | string[] | undefined): string {
  return Array.isArray(raw) ? raw[0] : raw || "";
}

export const generateEvidence = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const repoId = parseRepoId(req.params.githubRepositoryId);
    if (isNaN(repoId)) {
      return next(new AppError("Invalid repository ID", 400));
    }
    const { evidence, derivedFromExistingAnalysis } =
      await deriveProfessionalEvidence({
        userId: req.user!.id,
        githubRepositoryId: repoId,
      });
    res.status(201).json({ evidence, derivedFromExistingAnalysis });
  } catch (error) {
    next(error);
  }
};

export const getEvidence = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const repoId = parseRepoId(req.params.githubRepositoryId);
    if (isNaN(repoId)) {
      return next(new AppError("Invalid repository ID", 400));
    }
    const { evidence: evidenceOrNull } = await getProfessionalEvidence({
      userId: req.user!.id,
      githubRepositoryId: repoId,
    });
    if (!evidenceOrNull) {
      return next(new AppError("No professional evidence found", 404));
    }
    res.status(200).json({ evidence: evidenceOrNull });
  } catch (error) {
    next(error);
  }
};

export const updateEvidence = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const repoId = parseRepoId(req.params.githubRepositoryId);
    if (isNaN(repoId)) {
      return next(new AppError("Invalid repository ID", 400));
    }
    const repository = await GitHubRepositoryModel.findOne({
      user: req.user!.id,
      githubRepositoryId: repoId,
    });
    if (!repository) {
      return next(new AppError("Repository not imported", 404));
    }

    const evidence = await ProfessionalEvidence.findOne({
      user: req.user!.id,
      githubRepository: repository._id,
    });
    if (!evidence) {
      return next(new AppError("No professional evidence found", 404));
    }

    const patch: Record<string, unknown> = {};
    const fields: string[] = [
      "professionalSummary",
      "problemSolved",
      "contributionEvidence",
      "measurableImpact",
      "projectDomain",
      "technicalSkills",
      "architecturePractices",
      "technologies",
      "proposedTalkingPoints",
      "suggestedPostAngles",
      "roleRelevantKeywords",
      "senioritySignals",
    ];
    for (const field of fields) {
      if (req.body[field] !== undefined) patch[field] = req.body[field];
    }
    Object.assign(evidence, patch);
    await evidence.save();
    res.status(200).json({ evidence: toSafeEvidence(evidence) });
  } catch (error) {
    next(error);
  }
};

export const assistDraft = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const repoId = parseRepoId(req.params.githubRepositoryId);
    if (isNaN(repoId)) {
      return next(new AppError("Invalid repository ID", 400));
    }
    const { suggestions } = await assistLinkedInSuggestions({
      userId: req.user!.id,
      githubRepositoryId: repoId,
    });
    res.status(200).json({ suggestions });
  } catch (error) {
    next(error);
  }
};

export const listLinkedInDrafts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await listDrafts(req.user!.id, {
      status: req.query.status as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getLinkedInDraft = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { draft } = await getDraft(
      req.user!.id,
      parseDraftId(req.params.draftId)
    );
    res.status(200).json({ draft });
  } catch (error) {
    next(error);
  }
};

export const createLinkedInDraft = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { draft } = await createDraft(req.user!.id, {
      evidence: req.body.evidence,
      hook: req.body.hook,
      body: req.body.body,
      hashtags: req.body.hashtags,
    });
    res.status(201).json({ draft });
  } catch (error) {
    next(error);
  }
};

export const updateLinkedInDraft = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { draft } = await updateDraft(
      req.user!.id,
      parseDraftId(req.params.draftId),
      {
        hook: req.body.hook,
        body: req.body.body,
        hashtags: req.body.hashtags,
      }
    );
    res.status(200).json({ draft });
  } catch (error) {
    next(error);
  }
};

export const approveLinkedInDraft = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { draft } = await approveDraft(
      req.user!.id,
      parseDraftId(req.params.draftId)
    );
    res.status(200).json({ draft });
  } catch (error) {
    next(error);
  }
};

export const archiveLinkedInDraft = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { draft } = await archiveDraft(
      req.user!.id,
      parseDraftId(req.params.draftId)
    );
    res.status(200).json({ draft });
  } catch (error) {
    next(error);
  }
};

export const publishLinkedInDraft = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await linkedInService.publishDraft(
      req.user!.id,
      parseDraftId(req.params.draftId)
    );
    if (result.published) {
      res.status(200).json({
        draft: result.draft,
        posted: true,
        postUrn: result.postUrn,
        message: "Post published to LinkedIn",
      });
    } else {
      res.status(200).json({
        draft: result.draft,
        posted: false,
        message: "Post was not published",
      });
    }
  } catch (error) {
    next(error);
  }
};
