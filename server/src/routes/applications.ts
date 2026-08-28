import { Router } from "express";
import {
  createApplication,
  getApplications,
  getApplication,
  updateApplication,
  deleteApplication,
} from "../controllers/application";
import {
  getTimeline,
  addTimelineEvent,
  updateTimelineEvent,
  removeTimelineEvent,
} from "../controllers/applicationTimeline";
import {
  getSummary,
  generateSummary,
  regenerateSummary,
} from "../controllers/applicationSummary";
import {
  getPreparation,
  upsertPreparation,
  assistPreparation,
} from "../controllers/applicationPreparation";
import {
  listFollowUps,
  createFollowUp,
  updateFollowUp,
  deleteFollowUp,
} from "../controllers/applicationFollowUp";
import { assistFollowUps } from "../controllers/applicationFollowUpAssist";
import { listGlobalFollowUps } from "../controllers/globalFollowUps";
import { getAnalytics } from "../controllers/applicationAnalytics";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  createApplicationSchema,
  updateApplicationSchema,
} from "../validators/application";
import {
  createTimelineEventSchema,
  updateTimelineEventSchema,
} from "../validators/applicationTimeline";
import {
  createPreparationSchema,
  updatePreparationSchema,
} from "../validators/interviewPreparation";
import {
  createFollowUpSchema,
  updateFollowUpSchema,
} from "../validators/applicationFollowUp";

const router = Router();

router.use(authenticate);

router.get("/", getApplications);
router.post("/", validate(createApplicationSchema), createApplication);

// Global follow-up view across the user's applications. Registered BEFORE
// "/:id" so it is not swallowed by the application detail route.
router.get("/follow-ups", listGlobalFollowUps);

// Career application analytics. Registered BEFORE "/:id" so the literal
// "analytics" path is not swallowed by the application detail catch-all.
router.get("/analytics", getAnalytics);

router.get("/:id/timeline", getTimeline);
router.post("/:id/timeline", validate(createTimelineEventSchema), addTimelineEvent);
router.patch(
  "/:id/timeline/:eventId",
  validate(updateTimelineEventSchema),
  updateTimelineEvent
);
router.delete("/:id/timeline/:eventId", removeTimelineEvent);

router.get("/:id/summary", getSummary);
router.post("/:id/summary", generateSummary);
router.put("/:id/summary", regenerateSummary);

router.get("/:id/preparation", getPreparation);
router.put("/:id/preparation", validate(updatePreparationSchema), upsertPreparation);
router.patch("/:id/preparation", validate(updatePreparationSchema), upsertPreparation);
router.post("/:id/preparation/assist", assistPreparation);

router.get("/:id/follow-ups", listFollowUps);
router.post("/:id/follow-ups", validate(createFollowUpSchema), createFollowUp);
router.post("/:id/follow-ups/assist", assistFollowUps);
router.patch(
  "/:id/follow-ups/:followUpId",
  validate(updateFollowUpSchema),
  updateFollowUp
);
router.delete("/:id/follow-ups/:followUpId", deleteFollowUp);

router.get("/:id", getApplication);
router.patch("/:id", validate(updateApplicationSchema), updateApplication);
router.delete("/:id", deleteApplication);

export default router;
