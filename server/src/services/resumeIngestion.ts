import { Types } from "mongoose";
import Resume, { IResume } from "../models/Resume";
import { AppError } from "../middleware/errorHandler";
import { extractResumeContent } from "./resumeExtraction";
import { deriveResumeEvidence } from "./resumeEvidence";
import { deleteResumeFile, saveResumeFile } from "./resumeStorage";

/**
 * (Phase 2, Step 3) Upload pipeline for a resume document:
 *   store file (GridFS) -> extract bounded text -> derive structured evidence
 *   -> persist on the existing Resume model -> return a privacy-safe resume.
 *
 * Extraction/derivation never throw. A resume whose document cannot be parsed
 * is still stored with content/evidence marked appropriately, and matching
 * simply falls back to the user's trusted structured Profile data.
 */

export interface ProcessResumeUploadInput {
  userId: string;
  resumeId: string;
  originalName: string;
  mimeType?: string;
  buffer: Buffer;
}

export async function processResumeUpload(
  input: ProcessResumeUploadInput
): Promise<IResume> {
  const { userId, resumeId, originalName, mimeType, buffer } = input;

  const resume = await Resume.findOne({
    _id: resumeId,
    user: userId,
  });
  if (!resume) {
    throw new AppError("Resume not found", 404);
  }

  const extraction = await extractResumeContent({ buffer, originalName });

  let evidence = null;
  if (extraction.extractionStatus === "extracted" && extraction.text) {
    evidence = await deriveResumeEvidence(extraction.text);
  }

  const stored = await saveResumeFile({
    userId,
    originalName,
    mimeType,
    buffer,
  });

  const previousFileId = resume.fileId ? String(resume.fileId) : null;

  resume.fileId = stored.fileId;
  resume.mimeType = stored.contentType || mimeType || undefined;
  resume.fileName = originalName;
  resume.content = {
    text: extraction.text,
    length: extraction.metadata.length,
    truncated: extraction.metadata.truncated,
    format: extraction.metadata.format,
    extractionStatus: extraction.extractionStatus,
    extractedAt: new Date(),
  };
  resume.evidence = evidence ?? undefined;

  await resume.save();

  if (previousFileId && previousFileId !== String(stored.fileId)) {
    await deleteResumeFile(previousFileId).catch(() => false);
  }

  return resume;
}

export async function deleteResumeContent(resume: IResume): Promise<void> {
  if (resume.fileId) {
    await deleteResumeFile(String(resume.fileId)).catch(() => false);
    resume.fileId = undefined as never;
  }
  resume.content = undefined as never;
  resume.evidence = undefined as never;
  await resume.save();
}

/**
 * Privacy-safe serialization: never leak the raw extracted text, the GridFS
 * file id, or internal storage references through API responses.
 */
export function toSafeResume(
  resume: IResume | Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!resume) return null;
  const doc =
    typeof resume === "object" && "toObject" in resume
      ? (resume as IResume).toObject()
      : (resume as Record<string, unknown>);

  const content = doc.content
    ? {
        length: (doc.content as Record<string, unknown>).length,
        truncated: (doc.content as Record<string, unknown>).truncated,
        extractionStatus: (doc.content as Record<string, unknown>).extractionStatus,
      }
    : null;

  const { content: _content, fileId: _fileId, ...rest } = doc as Record<string, unknown>;

  return {
    ...rest,
    hasFile: Boolean(doc.fileId),
    // Replace sensitive nested content with a meta-only shape.
    content: content,
  };
}

export { Types };
