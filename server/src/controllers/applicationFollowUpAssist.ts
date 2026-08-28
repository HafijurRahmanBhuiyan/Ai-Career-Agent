import { Request, Response, NextFunction } from "express";
import { generateFollowUpAssist } from "../services/followUpAssist";

export const assistFollowUps = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const applicationId = String(req.params.id);

    const result = await generateFollowUpAssist(userId, applicationId);

    res.status(200).json({ suggestions: result.suggestions });
  } catch (error) {
    next(error);
  }
};
