import { Router } from "express";
import {
  connect,
  callback,
  disconnect,
  getStatus,
  getRepositories,
  importRepository,
  syncRepository,
  deleteRepository,
  getLanguages,
  getReadme,
  getImportedRepositories,
} from "../controllers/github";
import { authenticate } from "../middleware/auth";

const router = Router();

router.get("/connect", authenticate, connect);
router.get("/callback", authenticate, callback);
router.post("/disconnect", authenticate, disconnect);
router.get("/status", authenticate, getStatus);
router.get("/repositories", authenticate, getRepositories);
router.get("/repositories/imported", authenticate, getImportedRepositories);
router.post("/repositories/:githubRepositoryId/import", authenticate, importRepository);
router.post("/repositories/:githubRepositoryId/sync", authenticate, syncRepository);
router.delete("/repositories/:githubRepositoryId", authenticate, deleteRepository);
router.get("/repositories/:githubRepositoryId/languages", authenticate, getLanguages);
router.get("/repositories/:githubRepositoryId/readme", authenticate, getReadme);

export default router;
