import { Router } from "express";
import {
  getSkills,
  getSkill,
  createSkill,
  updateSkill,
  deleteSkill,
} from "../controllers/skill";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createSkillSchema, updateSkillSchema } from "../validators/skill";

const router = Router();

router.use(authenticate);

router.get("/", getSkills);
router.post("/", validate(createSkillSchema), createSkill);
router.get("/:id", getSkill);
router.patch("/:id", validate(updateSkillSchema), updateSkill);
router.delete("/:id", deleteSkill);

export default router;
