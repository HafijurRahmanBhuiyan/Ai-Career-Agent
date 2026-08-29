import { Router } from "express";
import {
  connect,
  callback,
  disconnect,
  getStatus,
} from "../controllers/linkedin";
import { authenticate } from "../middleware/auth";

const router = Router();

// The callback is a browser redirect from LinkedIn (no Authorization header),
// so it must NOT require authenticate. The userId is recovered from the
// validated OAuth state, matching the GitHub callback convention.
router.get("/connect", authenticate, connect);
router.get("/callback", callback);
router.get("/status", authenticate, getStatus);
router.post("/disconnect", authenticate, disconnect);

export default router;
