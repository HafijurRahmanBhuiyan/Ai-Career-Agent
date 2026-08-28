import { Router } from "express";
import { getSettings } from "../controllers/settings";
import { authenticate } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.get("/", getSettings);

export default router;
