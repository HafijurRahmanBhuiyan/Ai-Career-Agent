import { Router } from "express";
import {
  connect,
  callback,
  disconnect,
  getStatus,
  sync,
  listEmails,
  getEmail,
  applyStatus,
} from "../controllers/gmail";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { applyStatusSchema } from "../validators/gmail";

const router = Router();

router.get("/connect", authenticate, connect);
router.get("/callback", authenticate, callback);
router.get("/status", authenticate, getStatus);
router.post("/disconnect", authenticate, disconnect);
router.post("/sync", authenticate, sync);
router.get("/emails", authenticate, listEmails);
router.get("/emails/:id", authenticate, getEmail);
router.post(
  "/emails/:id/apply-status",
  authenticate,
  validate(applyStatusSchema),
  applyStatus
);

export default router;
