import { Router } from "express";
import {
  getEducations,
  getEducation,
  createEducation,
  updateEducation,
  deleteEducation,
} from "../controllers/education";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createEducationSchema, updateEducationSchema } from "../validators/education";

const router = Router();

router.use(authenticate);

router.get("/", getEducations);
router.post("/", validate(createEducationSchema), createEducation);
router.get("/:id", getEducation);
router.patch("/:id", validate(updateEducationSchema), updateEducation);
router.delete("/:id", deleteEducation);

export default router;
