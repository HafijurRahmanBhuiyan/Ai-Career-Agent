import { Request, Response, NextFunction } from "express";
import { buildApplicationAnalytics } from "../services/applicationAnalytics";
import { analyticsQuerySchema } from "../validators/applicationAnalytics";

export const getAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;

    const parsed = analyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return res.status(422).json({
        error: "Validation failed",
        statusCode: 422,
        details,
      });
    }

    const range = parsed.data.range ?? "all";
    const limit = parsed.data.limit;

    const result = await buildApplicationAnalytics(userId, { range, limit });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
