import { Router } from "express";
import {
  createApplication,
  getApplications,
  getApplication,
  updateApplication,
  deleteApplication,
} from "../controllers/application";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  createApplicationSchema,
  updateApplicationSchema,
} from "../validators/application";

const router = Router();

router.use(authenticate);

router.get("/", getApplications);
router.post("/", validate(createApplicationSchema), createApplication);
router.get("/:id", getApplication);
router.patch("/:id", validate(updateApplicationSchema), updateApplication);
router.delete("/:id", deleteApplication);

export default router;
