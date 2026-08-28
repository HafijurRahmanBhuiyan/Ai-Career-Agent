import { Router, Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  createDraftSchema,
  updateDraftSchema,
  approveDraftSchema,
  listDraftsQuerySchema,
} from "../validators/professionalContent";
import {
  listLinkedInDrafts,
  getLinkedInDraft,
  createLinkedInDraft,
  updateLinkedInDraft,
  approveLinkedInDraft,
  archiveLinkedInDraft,
  publishLinkedInDraft,
} from "../controllers/professionalContent";

const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      res.status(422).json({
        error: "Validation failed",
        statusCode: 422,
        details,
      });
      return;
    }
    req.query = parsed.data as unknown as Request["query"];
    next();
  };
};

const router = Router();

router.use(authenticate);

router.get("/", validateQuery(listDraftsQuerySchema), listLinkedInDrafts);
router.post("/", validate(createDraftSchema), createLinkedInDraft);
router.get("/:draftId", getLinkedInDraft);
router.patch("/:draftId", validate(updateDraftSchema), updateLinkedInDraft);
router.post("/:draftId/approve", validate(approveDraftSchema), approveLinkedInDraft);
router.post("/:draftId/archive", validate(approveDraftSchema), archiveLinkedInDraft);
router.post("/:draftId/publish", validate(approveDraftSchema), publishLinkedInDraft);

export default router;
