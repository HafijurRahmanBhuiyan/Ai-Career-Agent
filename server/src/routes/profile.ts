import { Router } from "express";
import {
  getProfile,
  createProfile,
  updateProfile,
  uploadCertificate,
  getCertificate,
  deleteCertificate,
  uploadCv,
  getCv,
  deleteCv,
} from "../controllers/profile";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createProfileSchema, updateProfileSchema } from "../validators/profile";
import { uploadProfileFile } from "../middleware/profileUpload";

const router = Router();

router.use(authenticate);

router.get("/", getProfile);
router.post("/", validate(createProfileSchema), createProfile);
router.patch("/", validate(updateProfileSchema), updateProfile);

router.post(
  "/documents/certificate/:index",
  uploadProfileFile,
  uploadCertificate
);
router.get("/documents/certificate/:index", getCertificate);
router.delete("/documents/certificate/:index", deleteCertificate);

router.post("/documents/cv", uploadProfileFile, uploadCv);
router.get("/documents/cv", getCv);
router.delete("/documents/cv", deleteCv);

export default router;
