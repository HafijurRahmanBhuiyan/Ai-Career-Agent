import { Router } from "express";
import { getJobMatches } from "../controllers/jobMatch.controller";
import { authenticate } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.get("/", getJobMatches);

export default router;
