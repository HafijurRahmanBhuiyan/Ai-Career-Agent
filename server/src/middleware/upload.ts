import multer from "multer";
import { MAX_RESUME_FILE_BYTES } from "../services/resumeStorage";

/**
 * (Phase 2, Step 3) Multipart upload middleware for resume documents.
 * Files are kept in memory (bounded by MAX_RESUME_FILE_BYTES) and never written
 * to disk. Only PDF/DOCX/DOC extensions pass the filter; everything else is
 * rejected before any parsing begins.
 */
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_RESUME_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|docx?)$/i;
    if (!allowed.test(file.originalname || "")) {
      const err = new Error(
        "Unsupported file type. Upload a .pdf, .docx or .doc file."
      ) as Error & { code?: string };
      err.code = "UNSUPPORTED_FILE_TYPE";
      return cb(err as never);
    }
    cb(null, true);
  },
});

export const uploadSingleResume = upload.single("file");

export function isMulterFileTooLarge(
  error: unknown
): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { code?: string }).code === "LIMIT_FILE_SIZE"
  );
}
