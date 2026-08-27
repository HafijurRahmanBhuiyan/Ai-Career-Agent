import { Router } from "express";
import {
  getExperiences,
  getExperience,
  createExperience,
  updateExperience,
  deleteExperience,
} from "../controllers/experience";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createExperienceSchema, updateExperienceSchema } from "../validators/experience";

const router = Router();

router.use(authenticate);

router.get("/", getExperiences);
router.post("/", validate(createExperienceSchema), createExperience);
router.get("/:id", getExperience);
router.patch("/:id", validate(updateExperienceSchema), updateExperience);
router.delete("/:id", deleteExperience);

export default router;
