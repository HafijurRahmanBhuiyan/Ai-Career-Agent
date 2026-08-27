import { Router } from "express";
import {
  getResumes,
  getResume,
  createResume,
  updateResume,
  deleteResume,
} from "../controllers/resume";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createResumeSchema, updateResumeSchema } from "../validators/resume";

const router = Router();

router.use(authenticate);

router.get("/", getResumes);
router.post("/", validate(createResumeSchema), createResume);
router.get("/:id", getResume);
router.patch("/:id", validate(updateResumeSchema), updateResume);
router.delete("/:id", deleteResume);

export default router;
