import { Request, Response, NextFunction } from "express";
import { buildCareerIntelligence } from "../services/careerIntelligence";

export const getCareerIntelligence = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const result = await buildCareerIntelligence(userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
