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
  setRepositoryApproved,
} from "../controllers/github";
import {
  analyze,
  getAnalysis,
  history,
  reanalyze,
} from "../controllers/projectAnalysis";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  generateEvidence,
  getEvidence,
  updateEvidence,
  assistDraft,
  getRepoLinkedInPreviewController,
  publishRepoLinkedInController,
} from "../controllers/professionalContent";
import { updateEvidenceSchema, publishRepoContentSchema } from "../validators/professionalContent";

const router = Router();

router.get("/connect", authenticate, connect);
router.get("/callback", callback);
router.post("/disconnect", authenticate, disconnect);
router.get("/status", authenticate, getStatus);
router.get("/repositories", authenticate, getRepositories);
router.get("/repositories/imported", authenticate, getImportedRepositories);
router.post("/repositories/:githubRepositoryId/import", authenticate, importRepository);
router.post("/repositories/:githubRepositoryId/sync", authenticate, syncRepository);
router.delete("/repositories/:githubRepositoryId", authenticate, deleteRepository);
router.get("/repositories/:githubRepositoryId/languages", authenticate, getLanguages);
router.get("/repositories/:githubRepositoryId/readme", authenticate, getReadme);
router.post("/repositories/:githubRepositoryId/analyze", authenticate, analyze);
router.get("/repositories/:githubRepositoryId/analysis", authenticate, getAnalysis);
router.get("/repositories/:githubRepositoryId/analyses", authenticate, history);
router.post("/repositories/:githubRepositoryId/reanalyze", authenticate, reanalyze);
router.post("/repositories/:githubRepositoryId/approve", authenticate, setRepositoryApproved);

// Professional-content workflow (Milestone 15). All routes are user-scoped and
// require the repository to be explicitly approved for professional use.
router.post(
  "/repositories/:githubRepositoryId/professional-evidence",
  authenticate,
  generateEvidence
);
router.get(
  "/repositories/:githubRepositoryId/professional-evidence",
  authenticate,
  getEvidence
);
router.patch(
  "/repositories/:githubRepositoryId/professional-evidence",
  authenticate,
  validate(updateEvidenceSchema),
  updateEvidence
);
router.post(
  "/repositories/:githubRepositoryId/linkedin-draft/assist",
  authenticate,
  assistDraft
);

// Repo-scoped LinkedIn preview + publish used by the GitHub integrations page.
// Both enforce the repository approval gate (403) and ownership (404).
router.get(
  "/repositories/:githubRepositoryId/linkedin-preview",
  authenticate,
  getRepoLinkedInPreviewController
);
router.post(
  "/repositories/:githubRepositoryId/linkedin-draft/publish",
  authenticate,
  validate(publishRepoContentSchema),
  publishRepoLinkedInController
);

export default router;
