import { Router } from "express";
import {
  connect,
  callback,
  disconnect,
  getStatus,
} from "../controllers/linkedin";
import { authenticate } from "../middleware/auth";

const router = Router();

router.use(authenticate);

router.get("/connect", connect);
router.get("/callback", callback);
router.get("/status", getStatus);
router.post("/disconnect", disconnect);

export default router;
