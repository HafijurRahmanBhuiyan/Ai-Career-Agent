import { Router } from "express";
import {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from "../controllers/project";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createProjectSchema, updateProjectSchema } from "../validators/project";

const router = Router();

router.use(authenticate);

router.get("/", getProjects);
router.post("/", validate(createProjectSchema), createProject);
router.get("/:id", getProject);
router.patch("/:id", validate(updateProjectSchema), updateProject);
router.delete("/:id", deleteProject);

export default router;
