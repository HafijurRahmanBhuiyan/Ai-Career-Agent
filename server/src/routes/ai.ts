import { Router, Request, Response, NextFunction } from "express";
import {
  getAvailableAIProviders,
  getDefaultAIProvider,
} from "../integrations/ai/aiRouter";
import { AIProvider } from "../integrations/ai/ai.types";

const router = Router();

router.get("/providers", (_req: Request, res: Response, next: NextFunction) => {
  try {
    const providers = getAvailableAIProviders();

    let defaultProvider: AIProvider | null = null;
    try {
      defaultProvider = getDefaultAIProvider();
    } catch {
      defaultProvider = null;
    }

    res.json({ providers, defaultProvider });
  } catch (error) {
    next(error);
  }
});

export default router;
