import { Request, Response, NextFunction } from "express";
import {
  analyzeGitHubRepository,
  getLatestAnalysis,
  getAnalysisHistory,
  reanalyzeRepository,
} from "../services/projectAnalysis";
import { AppError } from "../middleware/errorHandler";
import { AIProvider } from "../integrations/ai/ai.types";
import { ALL_PROVIDER_ORDER } from "../integrations/ai/aiRouter";
import { parseRequestId, runAiRequest } from "../integrations/ai/aiProgress";

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  console.error(
    "Project analysis endpoint error:",
    error instanceof Error ? error.stack : error
  );
  const message =
    error instanceof Error && error.message && error.message.trim()
      ? error.message.trim()
      : "Project analysis request failed. Please try again.";
  return new AppError(message, 502);
}

function parseRepoId(raw: string | string[] | undefined): number {
  const val = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(val || "", 10);
}

function parseProvider(raw: unknown): AIProvider | undefined {
  if (
    typeof raw === "string" &&
    (ALL_PROVIDER_ORDER as readonly string[]).includes(raw)
  ) {
    return raw as AIProvider;
  }

  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }

  throw new AppError(
    "Invalid AI provider. Use claude, gemini, openai, groq, openrouter, cerebras, or mistral.",
    400
  );
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

    const provider = parseProvider(req.body?.provider);
    const requestId = parseRequestId(req.body);

    const { analysis, readmeTruncated } = await runAiRequest(requestId, () =>
      analyzeGitHubRepository({
        userId: req.user!.id,
        githubRepositoryId: repoId,
        provider,
      })
    );

    res.status(201).json({
      analysis,
      readmeTruncated,
    });
  } catch (error) {
    next(toAppError(error));
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
    next(toAppError(error));
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
    next(toAppError(error));
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

    const provider = parseProvider(req.body?.provider);
    const requestId = parseRequestId(req.body);

    const { analysis, readmeTruncated } = await runAiRequest(requestId, () =>
      reanalyzeRepository({
        userId: req.user!.id,
        githubRepositoryId: repoId,
        provider,
      })
    );

    res.status(201).json({
      analysis,
      readmeTruncated,
    });
  } catch (error) {
    next(toAppError(error));
  }
};
