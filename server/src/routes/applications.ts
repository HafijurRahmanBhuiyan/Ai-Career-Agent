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

const router = Router();

router.use(authenticate);

router.get("/", getApplications);
router.post("/", validate(createApplicationSchema), createApplication);

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

router.get("/:id", getApplication);
router.patch("/:id", validate(updateApplicationSchema), updateApplication);
router.delete("/:id", deleteApplication);

export default router;
