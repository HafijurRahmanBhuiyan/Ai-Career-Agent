import { Router } from "express";
import {
  getResumes,
  getResume,
  createResume,
  updateResume,
  deleteResume,
  uploadResumeFile,
  downloadResumeFile,
} from "../controllers/resume";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { AppError } from "../middleware/errorHandler";
import { createResumeSchema, updateResumeSchema } from "../validators/resume";
import { uploadSingleResume } from "../middleware/upload";

const router = Router();

router.use(authenticate);

router.get("/", getResumes);
router.post("/", validate(createResumeSchema), createResume);
router.get("/:id", getResume);
router.patch("/:id", validate(updateResumeSchema), updateResume);
router.delete("/:id", deleteResume);

router.post("/:id/upload", (req, res, next) => {
  uploadSingleResume(req, res, (err) => {
    if (err) {
      const code = (err as { code?: string }).code;
      if (code === "LIMIT_FILE_SIZE") {
        return next(new AppError("Resume file exceeds the maximum allowed size of 8MB", 413));
      }
      if (code === "UNSUPPORTED_FILE_TYPE") {
        return next(new AppError(err.message, 415));
      }
      return next(err);
    }
    next();
  });
}, uploadResumeFile);

router.get("/:id/file", downloadResumeFile);

export default router;
