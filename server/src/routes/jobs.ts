import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  getJobs,
  discover,
  getJob,
  runJobMaintenance,
  runAutomaticDiscoveryHandler,
} from "../controllers/jobs";
import {
  analyzeMatch,
  getMatch,
  reanalyzeMatch,
} from "../controllers/jobMatch.controller";
import {
  getOpportunities,
  getOpportunity,
  applyOpportunity,
  ingestJobsHandler,
} from "../controllers/opportunity.controller";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/authorize";
import { Role } from "../types";

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

const ingestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? "unknown",
  message: {
    error: "Too many ingestion requests. Please wait and try again.",
    statusCode: 429,
  },
});

router.get("/", getJobs);
router.post("/discover", discoveryLimiter, discover);
router.post("/ingest", ingestLimiter, ingestJobsHandler);

// Opportunity feed (Milestone 17). Registered BEFORE "/:id" so the literal
// "opportunities" path is not swallowed by the job detail catch-all.
router.get("/opportunities", getOpportunities);
router.get("/opportunities/:id", getOpportunity);

// Opportunity dashboard Apply compose. Creates/reuses the user's local
// Application (status "saved") and returns the handoff/preparation payload
// from the existing execution flow. Never advances status to "applied" here;
// the explicit confirmation in POST /api/applications/:id/execution does.
router.post("/opportunities/:id/apply", applyOpportunity);

// Admin-only maintenance: soft-deactivate stale jobs. Not publicly accessible
// (requires authentication + ADMIN role). Registered before "/:id".
router.post("/maintenance/stale", requireRole(Role.ADMIN), runJobMaintenance);

// Admin-only internal trigger for canonical/global automatic discovery. The n8n
// scheduler calls this (not the per-user /discover). Registered before "/:id".
router.post(
  "/discovery/run",
  requireRole(Role.ADMIN),
  runAutomaticDiscoveryHandler
);

router.post("/:id/match", analyzeMatch);
router.get("/:id/match", getMatch);
router.post("/:id/match/reanalyze", reanalyzeMatch);

router.get("/:id", getJob);

export default router;
