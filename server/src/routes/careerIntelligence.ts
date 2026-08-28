import { Router } from "express";
import { getCareerIntelligence } from "../controllers/careerIntelligence";
import { authenticate } from "../middleware/auth";

const router = Router();

router.get("/career-intelligence", authenticate, getCareerIntelligence);

export default router;
