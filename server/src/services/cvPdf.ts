import PDFDocument from "pdfkit";
import type { ICVProfile } from "../models/CVProfile";

const FONT_SANS = "Helvetica";
const FONT_SANS_BOLD = "Helvetica-Bold";
const FONT_SANS_OBLIQUE = "Helvetica-Oblique";
const FONT_SANS_BOLD_OBLIQUE = "Helvetica-BoldOblique";

const COLORS = {
  black: "#1a1a1a",
  darkGray: "#333333",
  mediumGray: "#666666",
  lightGray: "#999999",
  border: "#cccccc",
  accent: "#2563eb",
};

function addHorizontalLine(doc: PDFKit.PDFDocument, y: number) {
  doc
    .moveTo(50, y)
    .lineTo(doc.page.width - 50, y)
    .lineWidth(0.5)
    .strokeColor(COLORS.border)
    .stroke()
    .moveDown(0.3);
}

function renderSectionHeading(doc: PDFKit.PDFDocument, title: string) {
  doc
    .font(FONT_SANS_BOLD)
    .fontSize(11)
    .fillColor(COLORS.accent)
    .text(title.toUpperCase(), { continued: false });
  doc.moveDown(0.15);
  addHorizontalLine(doc, doc.y);
  doc.fillColor(COLORS.black).moveDown(0.2);
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function safeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function generateCvPdf(cv: ICVProfile): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Defensive normalization: CV profiles can be missing optional sections or
    // personalInfo entirely (older records, partial imports). Never crash the
    // PDF renderer because of that.
    const personalInfo = (cv.personalInfo || {}) as Record<string, unknown>;
    const education = safeArray<Record<string, unknown>>(cv.education);
    const workExperience = safeArray<Record<string, unknown>>(
      cv.workExperience
    );
    const skills = safeArray<string>(cv.skills);
    const projects = safeArray<Record<string, unknown>>(cv.projects);
    const achievements = safeArray<string>(cv.achievements);
    const additionalInfo = (cv.additionalInfo || {}) as {
      bullets?: unknown;
      description?: unknown;
    };

    const fullName = safeText(personalInfo.fullName);
    const email = safeText(personalInfo.email);
    const phone = safeText(personalInfo.phone);
    const location = safeText(personalInfo.location);
    const linkedIn = safeText(personalInfo.linkedIn);
    const website = safeText(personalInfo.website);
    const professionalSummary = safeText(cv.professionalSummary);

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
      info: {
        Title: safeText(cv.title),
        Author: fullName,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // --- Header ---
    doc
      .font(FONT_SANS_BOLD)
      .fontSize(20)
      .fillColor(COLORS.black)
      .text(fullName, { align: "center" });

    const contactParts: string[] = [];
    if (email) contactParts.push(email);
    if (phone) contactParts.push(phone);
    if (location) contactParts.push(location);
    if (contactParts.length) {
      doc
        .font(FONT_SANS)
        .fontSize(9)
        .fillColor(COLORS.mediumGray)
        .text(contactParts.join(" | "), { align: "center" });
    }

    const linkParts: string[] = [];
    if (linkedIn) linkParts.push(linkedIn);
    if (website) linkParts.push(website);
    if (linkParts.length) {
      doc
        .font(FONT_SANS)
        .fontSize(8)
        .fillColor(COLORS.accent)
        .text(linkParts.join(" | "), {
          align: "center",
          link: linkParts[0],
        });
    }

    doc.moveDown(0.3);
    addHorizontalLine(doc, doc.y);
    doc.moveDown(0.3);

    // --- Professional Summary ---
    if (professionalSummary.trim()) {
      renderSectionHeading(doc, "Professional Summary");
      doc
        .font(FONT_SANS)
        .fontSize(9.5)
        .fillColor(COLORS.darkGray)
        .text(professionalSummary, { lineGap: 2 });
      doc.moveDown(0.4);
    }

    // --- Education ---
    if (education.length) {
      renderSectionHeading(doc, "Education");
      for (const edu of education) {
        const degreeType = safeText(edu.degreeType);
        const degree = safeText(edu.degree);
        const field = safeText(edu.field);
        const degreeLine = [
          degreeType,
          [degree, field].filter(Boolean).join(" in "),
        ]
          .filter(Boolean)
          .join(" — ");
        doc
          .font(FONT_SANS_BOLD)
          .fontSize(10)
          .fillColor(COLORS.black)
          .text(degreeLine, { continued: false });
        doc
          .font(FONT_SANS)
          .fontSize(9)
          .fillColor(COLORS.mediumGray)
          .text(safeText(edu.institution), { continued: true });
        const gradeValue = safeText(edu.gradeValue);
        if (gradeValue) {
          const gradeLabel = ["SSC", "HSC"].includes(degreeType)
            ? "GPA"
            : "CGPA";
          doc
            .font(FONT_SANS)
            .fontSize(8)
            .fillColor(COLORS.lightGray)
            .text(
              `  |  ${gradeLabel}: ${gradeValue}`,
              { continued: false }
            );
        }
        doc
          .font(FONT_SANS_OBLIQUE)
          .fontSize(8)
          .fillColor(COLORS.lightGray)
          .text(
            `${safeText(edu.startDate)} – ${safeText(edu.endDate) || "Present"}`,
            { continued: false }
          );

        const highlights = safeArray<string>(edu.highlights);
        if (highlights.length) {
          doc.moveDown(0.15);
          for (const h of highlights) {
            doc
              .font(FONT_SANS)
              .fontSize(9)
              .fillColor(COLORS.darkGray)
              .text(`• ${h}`, { indent: 10, lineGap: 1 });
          }
        }
        doc.moveDown(0.3);
      }
      doc.moveDown(0.1);
    }

    // --- Work Experience ---
    if (workExperience.length) {
      renderSectionHeading(doc, "Work Experience");
      for (const exp of workExperience) {
        doc
          .font(FONT_SANS_BOLD)
          .fontSize(10)
          .fillColor(COLORS.black)
          .text(safeText(exp.designation), { continued: true })
          .font(FONT_SANS)
          .fontSize(9)
          .fillColor(COLORS.mediumGray)
          .text(
            `  |  ${safeText(exp.company)}${
              safeText(exp.location) ? ", " + safeText(exp.location) : ""
            }`,
            { align: "left" }
          );
        doc
          .font(FONT_SANS_OBLIQUE)
          .fontSize(8)
          .fillColor(COLORS.lightGray)
          .text(
            `${safeText(exp.startDate)} – ${
              exp.current ? "Present" : safeText(exp.endDate) || ""
            }`
          );

        const description = safeText(exp.description);
        if (description.trim()) {
          doc.moveDown(0.15);
          doc
            .font(FONT_SANS)
            .fontSize(9)
            .fillColor(COLORS.darkGray)
            .text(description, { lineGap: 2 });
        }

        const highlights = safeArray<string>(exp.highlights);
        if (highlights.length) {
          doc.moveDown(0.15);
          for (const h of highlights) {
            doc
              .font(FONT_SANS)
              .fontSize(9)
              .fillColor(COLORS.darkGray)
              .text(`• ${h}`, { indent: 10, lineGap: 1 });
          }
        }
        doc.moveDown(0.3);
      }
      doc.moveDown(0.1);
    }

    // --- Skills ---
    if (skills.length) {
      renderSectionHeading(doc, "Skills");
      doc
        .font(FONT_SANS)
        .fontSize(9)
        .fillColor(COLORS.darkGray)
        .text(skills.join(" • "), { lineGap: 2 });
      doc.moveDown(0.4);
    }

    // --- Projects ---
    if (projects.length) {
      renderSectionHeading(doc, "Projects");
      for (const proj of projects) {
        doc
          .font(FONT_SANS_BOLD)
          .fontSize(10)
          .fillColor(COLORS.black)
          .text(safeText(proj.name), { continued: false });
        if (safeText(proj.githubLink)) {
          doc
            .font(FONT_SANS)
            .fontSize(8)
            .fillColor(COLORS.accent)
            .text(`GitHub: ${safeText(proj.githubLink)}`, {
              link: safeText(proj.githubLink),
            });
        }
        if (safeText(proj.liveLink)) {
          doc
            .font(FONT_SANS)
            .fontSize(8)
            .fillColor(COLORS.accent)
            .text(`Live: ${safeText(proj.liveLink)}`, {
              link: safeText(proj.liveLink),
            });
        }
        const description = safeText(proj.description);
        if (description) {
          doc
            .font(FONT_SANS)
            .fontSize(9)
            .fillColor(COLORS.darkGray)
            .text(description, { lineGap: 1 });
        }
        const highlights = safeArray<string>(proj.highlights);
        if (highlights.length) {
          doc.moveDown(0.15);
          for (const h of highlights) {
            doc
              .font(FONT_SANS)
              .fontSize(9)
              .fillColor(COLORS.darkGray)
              .text(`• ${h}`, { indent: 10, lineGap: 1 });
          }
        }
        doc.moveDown(0.3);
      }
      doc.moveDown(0.1);
    }

    // --- Achievements ---
    if (achievements.length) {
      renderSectionHeading(doc, "Achievements");
      for (const a of achievements) {
        doc
          .font(FONT_SANS)
          .fontSize(9)
          .fillColor(COLORS.darkGray)
          .text(`• ${a}`, { indent: 10, lineGap: 1 });
      }
      doc.moveDown(0.3);
    }

    // --- Additional Information ---
    const bullets = safeArray<string>(additionalInfo.bullets);
    const additionalDescription = safeText(additionalInfo.description);
    if (bullets.length || additionalDescription.trim()) {
      renderSectionHeading(doc, "Additional Information");
      if (bullets.length) {
        for (const b of bullets) {
          doc
            .font(FONT_SANS)
            .fontSize(9)
            .fillColor(COLORS.darkGray)
            .text(`• ${b}`, { indent: 10, lineGap: 1 });
        }
        doc.moveDown(0.3);
      }
      if (additionalDescription.trim()) {
        doc
          .font(FONT_SANS)
          .fontSize(9)
          .fillColor(COLORS.darkGray)
          .text(additionalDescription, { lineGap: 2 });
        doc.moveDown(0.3);
      }
    }

    doc.end();
  });
}