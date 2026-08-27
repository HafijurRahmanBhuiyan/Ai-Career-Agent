import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getJobs, discover, getJob } from "../controllers/jobs";
import { authenticate } from "../middleware/auth";

const router = Router();

router.use(authenticate);

const discoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? "unknown",
  message: {
    error: "Too many discovery requests. Please wait and try again.",
    statusCode: 429,
  },
});

router.get("/", getJobs);
router.post("/discover", discoveryLimiter, discover);
router.get("/:id", getJob);

export default router;
