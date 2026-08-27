import { Request, Response, NextFunction } from "express";
import {
  analyzeGitHubRepository,
  getLatestAnalysis,
  getAnalysisHistory,
  reanalyzeRepository,
} from "../services/projectAnalysis";
import { AppError } from "../middleware/errorHandler";

function parseRepoId(raw: string | string[] | undefined): number {
  const val = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(val || "", 10);
}

export const analyze = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const repoId = parseRepoId(req.params.githubRepositoryId);
    if (isNaN(repoId)) {
      return next(new AppError("Invalid repository ID", 400));
    }

    const { analysis, readmeTruncated } = await analyzeGitHubRepository({
      userId: req.user!.id,
      githubRepositoryId: repoId,
    });

    res.status(201).json({
      analysis,
      readmeTruncated,
    });
  } catch (error) {
    next(error);
  }
};

export const getAnalysis = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const repoId = parseRepoId(req.params.githubRepositoryId);
    if (isNaN(repoId)) {
      return next(new AppError("Invalid repository ID", 400));
    }

    const { analysis } = await getLatestAnalysis({
      userId: req.user!.id,
      githubRepositoryId: repoId,
    });

    res.status(200).json({ analysis });
  } catch (error) {
    next(error);
  }
};

export const history = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const repoId = parseRepoId(req.params.githubRepositoryId);
    if (isNaN(repoId)) {
      return next(new AppError("Invalid repository ID", 400));
    }

    const { analyses } = await getAnalysisHistory({
      userId: req.user!.id,
      githubRepositoryId: repoId,
    });

    res.status(200).json({ analyses });
  } catch (error) {
    next(error);
  }
};

export const reanalyze = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const repoId = parseRepoId(req.params.githubRepositoryId);
    if (isNaN(repoId)) {
      return next(new AppError("Invalid repository ID", 400));
    }

    const { analysis, readmeTruncated } = await reanalyzeRepository({
      userId: req.user!.id,
      githubRepositoryId: repoId,
    });

    res.status(201).json({
      analysis,
      readmeTruncated,
    });
  } catch (error) {
    next(error);
  }
};
