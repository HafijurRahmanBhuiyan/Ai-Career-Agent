import { Request, Response, NextFunction } from "express";
import { generateFollowUpAssist } from "../services/followUpAssist";
import { parseRequestId, runAiRequest } from "../integrations/ai/aiProgress";

export const assistFollowUps = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const applicationId = String(req.params.id);

    const result = await runAiRequest(parseRequestId(req.body), () =>
      generateFollowUpAssist(userId, applicationId)
    );

    res.status(200).json({ suggestions: result.suggestions });
  } catch (error) {
    next(error);
  }
};
