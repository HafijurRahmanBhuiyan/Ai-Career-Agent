import { Router } from "express";
import {
  getNotificationCenterHandler,
  markNotificationsSeen,
} from "../controllers/notificationCenter";
import { authenticate } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.get("/", getNotificationCenterHandler);
router.post("/seen", markNotificationsSeen);

export default router;
