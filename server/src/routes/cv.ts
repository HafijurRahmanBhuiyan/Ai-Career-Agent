import { Router } from "express";
import {
  getCVProfiles,
  getCVProfile,
  createCVProfile,
  updateCVProfile,
  deleteCVProfile,
  generateCVPdf,
} from "../controllers/cvController";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createCVProfileSchema, updateCVProfileSchema } from "../validators/cv";

const router = Router();

router.use(authenticate);

router.get("/", getCVProfiles);
router.post("/", validate(createCVProfileSchema), createCVProfile);
router.get("/:id", getCVProfile);
router.patch("/:id", validate(updateCVProfileSchema), updateCVProfile);
router.delete("/:id", deleteCVProfile);
router.get("/:id/generate-pdf", generateCVPdf);

export default router;
