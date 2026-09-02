import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import {
  ResumeExtractionResult,
  ResumeExtractionStatus,
} from "./resumeTypes";

/**
 * (Phase 2, Step 3) Resume document text-extraction abstraction.
 *
 * Supported formats:
 *   - .pdf  -> pdf-parse
 *   - .docx -> mammoth (extractRawText)
 *
 * Unsupported formats (.doc and any other extension), empty inputs, and parse
 * failures all degrade gracefully to a non-throwing `extractionStatus` so a
 * single bad document can never crash the application.
 *
 * The returned text is bounded to `MAX_RESUME_TEXT_CHARS` and flagged as
 * truncated. Raw text is a server-side artifact only; it is never exposed via
 * public APIs and never sent to the job matcher as raw text.
 */

export const MAX_RESUME_TEXT_CHARS = 20000;

function statusOf(status: ResumeExtractionStatus) {
  return status;
}

function formatFromName(originalName: string | undefined): ResumeExtractionResult["metadata"]["format"] {
  const name = (originalName || "").toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".doc")) return "doc";
  return "unknown";
}

function boundedText(text: string): { text: string; truncated: boolean } {
  const clean = (text || "").replace(/\u0000/g, "").trim();
  if (clean.length <= MAX_RESUME_TEXT_CHARS) {
    return { text: clean, truncated: false };
  }
  return {
    text: clean.slice(0, MAX_RESUME_TEXT_CHARS),
    truncated: true,
  };
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parsed = await pdfParse(buffer);
  return parsed?.text ?? "";
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result?.value ?? "";
}

/**
 * Extract bounded text from an uploaded resume document. Never throws.
 */
export async function extractResumeContent(input: {
  buffer: Buffer;
  originalName?: string;
}): Promise<ResumeExtractionResult> {
  const { buffer, originalName } = input;
  const format = formatFromName(originalName);

  if (!buffer || buffer.length === 0) {
    return {
      text: "",
      metadata: { format, length: 0, truncated: false },
      extractionStatus: statusOf("empty"),
    };
  }

  if (format !== "pdf" && format !== "docx") {
    return {
      text: "",
      metadata: { format, length: buffer.length, truncated: false },
      extractionStatus: statusOf("unsupported"),
    };
  }

  try {
    const raw =
      format === "pdf" ? await extractPdf(buffer) : await extractDocx(buffer);
    const { text, truncated } = boundedText(raw);
    if (!text) {
      return {
        text: "",
        metadata: { format, length: buffer.length, truncated },
        extractionStatus: statusOf("empty"),
      };
    }
    return {
      text,
      metadata: { format, length: buffer.length, truncated },
      extractionStatus: statusOf("extracted"),
    };
  } catch {
    return {
      text: "",
      metadata: { format, length: buffer.length, truncated: false },
      extractionStatus: statusOf("failed"),
    };
  }
}
