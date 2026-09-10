import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { analyzeWithAIFallback } from "../integrations/ai/aiRouter";

const MAX_CERT_TEXT_CHARS = 15000;

export interface CertificateExtractedData {
  institution: string;
  degree: string;
  fieldOfStudy: string;
  session: string;
  passingYear: string;
  gpa: string;
  cgpa: string;
  startDate: string;
  endDate: string;
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parsed = await pdfParse(buffer);
  return parsed?.text ?? "";
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result?.value ?? "";
}

function formatFromName(
  name: string
): "pdf" | "docx" | "unknown" {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  return "unknown";
}

export async function extractTextFromCertificate(input: {
  buffer: Buffer;
  originalName: string;
}): Promise<string> {
  const { buffer, originalName } = input;
  const format = formatFromName(originalName);

  if (!buffer || buffer.length === 0) return "";

  if (format !== "pdf" && format !== "docx") return "";

  try {
    const raw =
      format === "pdf"
        ? await extractPdf(buffer)
        : await extractDocx(buffer);
    const clean = (raw || "").replace(/\u0000/g, "").trim();
    return clean.length > MAX_CERT_TEXT_CHARS
      ? clean.slice(0, MAX_CERT_TEXT_CHARS)
      : clean;
  } catch {
    return "";
  }
}

export async function parseCertificateWithAI(
  text: string,
  educationLevel: string
): Promise<CertificateExtractedData> {
  if (!text) {
    return {
      institution: "",
      degree: "",
      fieldOfStudy: "",
      session: "",
      passingYear: "",
      gpa: "",
      cgpa: "",
      startDate: "",
      endDate: "",
    };
  }

  const isSecondary =
    educationLevel === "ssc" || educationLevel === "hsc";

  const systemPrompt = `You are an expert at extracting information from educational certificates, transcripts, and mark sheets.
Extract the following fields from the certificate text provided.
Return ONLY a valid JSON object with these exact keys (no markdown, no explanation):
{
  "institution": "name of the school/college/university",
  "degree": "name of the degree/certificate (e.g. SSC, HSC, Bachelor of Science)",
  "fieldOfStudy": "major/group/field of study if mentioned",
  "session": "academic session (e.g. 2023-24)",
  "passingYear": "year the certificate was awarded (e.g. 2024)",
  "gpa": "GPA/score if mentioned (e.g. 4.50/5.00) - use for secondary level",
  "cgpa": "CGPA if mentioned (e.g. 3.50 out of 4.00) - use for degree level",
  "startDate": "start date of the program if available",
  "endDate": "end/graduation date if available"
}
For fields that cannot be determined from the text, use an empty string "".
${isSecondary ? "Focus on extracting GPA and passing year." : "Focus on extracting CGPA and start/end dates."}`;

  const response = await analyzeWithAIFallback({
    systemPrompt,
    userMessage: `Certificate text:\n\n${text}`,
  });

  try {
    const cleaned = response.text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(cleaned) as Partial<CertificateExtractedData>;
    return {
      institution: parsed.institution || "",
      degree: parsed.degree || "",
      fieldOfStudy: parsed.fieldOfStudy || "",
      session: parsed.session || "",
      passingYear: parsed.passingYear || "",
      gpa: parsed.gpa || "",
      cgpa: parsed.cgpa || "",
      startDate: parsed.startDate || "",
      endDate: parsed.endDate || "",
    };
  } catch {
    return {
      institution: "",
      degree: "",
      fieldOfStudy: "",
      session: "",
      passingYear: "",
      gpa: "",
      cgpa: "",
      startDate: "",
      endDate: "",
    };
  }
}
