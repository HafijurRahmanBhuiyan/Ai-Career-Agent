import { Router } from "express";
import { getProfile, createProfile, updateProfile } from "../controllers/profile";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createProfileSchema, updateProfileSchema } from "../validators/profile";

const router = Router();

router.use(authenticate);

router.get("/", getProfile);
router.post("/", validate(createProfileSchema), createProfile);
router.patch("/", validate(updateProfileSchema), updateProfile);

export default router;
