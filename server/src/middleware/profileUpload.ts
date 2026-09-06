import multer from "multer";
import { MAX_RESUME_FILE_BYTES } from "../services/resumeStorage";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_RESUME_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|docx?|png|jpe?g|gif|webp)$/i;
    if (!allowed.test(file.originalname || "")) {
      const err = new Error(
        "Unsupported file type. Upload a .pdf, .docx, .doc, .png, .jpg, .jpeg, .gif or .webp file."
      ) as Error & { code?: string };
      err.code = "UNSUPPORTED_FILE_TYPE";
      return cb(err as never);
    }
    cb(null, true);
  },
});

export const uploadProfileFile = upload.single("file");
