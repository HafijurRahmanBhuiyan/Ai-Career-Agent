import { Request, Response, NextFunction } from "express";
import {
  getApplicationSummary,
  getOrCreateApplicationSummary,
  reanalyzeApplicationSummary,
} from "../services/applicationSummary";

export const getSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { summary } = await getApplicationSummary(
      req.user!.id,
      String(req.params.id)
    );

    if (!summary) {
      return res.status(200).json({ summary: null });
    }

    res.status(200).json({ summary: toSafeSummary(summary) });
  } catch (error) {
    next(error);
  }
};

export const generateSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { summary, cached } = await getOrCreateApplicationSummary(
      req.user!.id,
      String(req.params.id)
    );

    res.status(200).json({ summary: toSafeSummary(summary), cached });
  } catch (error) {
    next(error);
  }
};

export const regenerateSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { summary, cached } = await reanalyzeApplicationSummary(
      req.user!.id,
      String(req.params.id)
    );

    res.status(200).json({ summary: toSafeSummary(summary), cached });
  } catch (error) {
    next(error);
  }
};

function toSafeSummary<T extends object>(summary: T): Record<string, unknown> {
  const source =
    summary &&
    typeof (summary as { toObject?: unknown }).toObject === "function"
      ? (summary as unknown as { toObject: () => Record<string, unknown> }).toObject()
      : summary;

  const { __v, user, ...safe } = source as Record<string, unknown>;
  void __v;
  void user;
  return safe;
}
