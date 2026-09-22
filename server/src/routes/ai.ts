import { Router, Request, Response, NextFunction } from "express";
import {
  getAvailableAIProviders,
  getDefaultAIProvider,
} from "../integrations/ai/aiRouter";
import { subscribeAiProgress } from "../integrations/ai/aiProgress";
import { AIProvider } from "../integrations/ai/ai.types";
import { authenticate } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

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

// Server-Sent Events stream of live provider/model attempts for a running AI
// request. The client opens this BEFORE issuing the POST that carries the same
// requestId. The stream closes itself once the request publishes "finished".
router.get(
  "/progress/:requestId",
  authenticate,
  (req: Request, res: Response, next: NextFunction) => {
    const requestId = String(req.params.requestId || "");

    if (!requestId) {
      return next(new AppError("Missing requestId", 400));
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    res.write(": connected\n\n");

    const heartbeat = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 15000);

    const unsubscribe = subscribeAiProgress(requestId, (event) => {
      res.write(`event: attempt\ndata: ${JSON.stringify(event)}\n\n`);

      if (event.status === "finished") {
        clearInterval(heartbeat);
        unsubscribe();
        res.end();
      }
    });

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };

    req.on("close", cleanup);
    res.on("error", cleanup);
  }
);

export default router;
