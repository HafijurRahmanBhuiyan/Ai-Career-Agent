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

export function generateCvPdf(cv: ICVProfile): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
      info: {
        Title: cv.title,
        Author: cv.personalInfo.fullName,
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
      .text(cv.personalInfo.fullName, { align: "center" });

    const contactParts: string[] = [];
    if (cv.personalInfo.email) contactParts.push(cv.personalInfo.email);
    if (cv.personalInfo.phone) contactParts.push(cv.personalInfo.phone);
    if (cv.personalInfo.location) contactParts.push(cv.personalInfo.location);
    if (contactParts.length) {
      doc
        .font(FONT_SANS)
        .fontSize(9)
        .fillColor(COLORS.mediumGray)
        .text(contactParts.join(" | "), { align: "center" });
    }

    const linkParts: string[] = [];
    if (cv.personalInfo.linkedIn) linkParts.push(cv.personalInfo.linkedIn);
    if (cv.personalInfo.website) linkParts.push(cv.personalInfo.website);
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
    if (cv.professionalSummary?.trim()) {
      renderSectionHeading(doc, "Professional Summary");
      doc
        .font(FONT_SANS)
        .fontSize(9.5)
        .fillColor(COLORS.darkGray)
        .text(cv.professionalSummary, { lineGap: 2 });
      doc.moveDown(0.4);
    }

    // --- Education ---
    if (cv.education?.length) {
      renderSectionHeading(doc, "Education");
      for (const edu of cv.education) {
        const degreeLine = [
          edu.degreeType,
          [edu.degree, edu.field].filter(Boolean).join(" in "),
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
          .text(edu.institution, { continued: true });
        if (edu.gradeValue) {
          const gradeLabel = ["SSC", "HSC"].includes(edu.degreeType || "")
            ? "GPA"
            : "CGPA";
          doc
            .font(FONT_SANS)
            .fontSize(8)
            .fillColor(COLORS.lightGray)
            .text(
              `  |  ${gradeLabel}: ${edu.gradeValue}`,
              { continued: false }
            );
        }
        doc
          .font(FONT_SANS_OBLIQUE)
          .fontSize(8)
          .fillColor(COLORS.lightGray)
          .text(
            `${edu.startDate} – ${edu.endDate || "Present"}`,
            { continued: false }
          );

        if (edu.highlights?.length) {
          doc.moveDown(0.15);
          for (const h of edu.highlights) {
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
    if (cv.workExperience?.length) {
      renderSectionHeading(doc, "Work Experience");
      for (const exp of cv.workExperience) {
        doc
          .font(FONT_SANS_BOLD)
          .fontSize(10)
          .fillColor(COLORS.black)
          .text(exp.designation, { continued: true })
          .font(FONT_SANS)
          .fontSize(9)
          .fillColor(COLORS.mediumGray)
          .text(
            `  |  ${exp.company}${exp.location ? ", " + exp.location : ""}`,
            { align: "left" }
          );
        doc
          .font(FONT_SANS_OBLIQUE)
          .fontSize(8)
          .fillColor(COLORS.lightGray)
          .text(
            `${exp.startDate} – ${exp.current ? "Present" : exp.endDate || ""}`
          );

        if (exp.description?.trim()) {
          doc.moveDown(0.15);
          doc
            .font(FONT_SANS)
            .fontSize(9)
            .fillColor(COLORS.darkGray)
            .text(exp.description, { lineGap: 2 });
        }

        if (exp.highlights?.length) {
          doc.moveDown(0.15);
          for (const h of exp.highlights) {
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
    if (cv.skills?.length) {
      renderSectionHeading(doc, "Skills");
      doc
        .font(FONT_SANS)
        .fontSize(9)
        .fillColor(COLORS.darkGray)
        .text(cv.skills.join(" • "), { lineGap: 2 });
      doc.moveDown(0.4);
    }

    // --- Projects ---
    if (cv.projects?.length) {
      renderSectionHeading(doc, "Projects");
      for (const proj of cv.projects) {
        doc
          .font(FONT_SANS_BOLD)
          .fontSize(10)
          .fillColor(COLORS.black)
          .text(proj.name, { continued: false });
        if (proj.githubLink) {
          doc
            .font(FONT_SANS)
            .fontSize(8)
            .fillColor(COLORS.accent)
            .text(`GitHub: ${proj.githubLink}`, { link: proj.githubLink });
        }
        if (proj.liveLink) {
          doc
            .font(FONT_SANS)
            .fontSize(8)
            .fillColor(COLORS.accent)
            .text(`Live: ${proj.liveLink}`, { link: proj.liveLink });
        }
        if (proj.description) {
          doc
            .font(FONT_SANS)
            .fontSize(9)
            .fillColor(COLORS.darkGray)
            .text(proj.description, { lineGap: 1 });
        }
        if (proj.highlights?.length) {
          doc.moveDown(0.15);
          for (const h of proj.highlights) {
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
    if (cv.achievements?.length) {
      renderSectionHeading(doc, "Achievements");
      for (const a of cv.achievements) {
        doc
          .font(FONT_SANS)
          .fontSize(9)
          .fillColor(COLORS.darkGray)
          .text(`• ${a}`, { indent: 10, lineGap: 1 });
      }
      doc.moveDown(0.3);
    }

    // --- Additional Information ---
    if (
      cv.additionalInfo?.bullets?.length ||
      cv.additionalInfo?.description?.trim()
    ) {
      renderSectionHeading(doc, "Additional Information");
      if (cv.additionalInfo.bullets?.length) {
        for (const b of cv.additionalInfo.bullets) {
          doc
            .font(FONT_SANS)
            .fontSize(9)
            .fillColor(COLORS.darkGray)
            .text(`• ${b}`, { indent: 10, lineGap: 1 });
        }
        doc.moveDown(0.3);
      }
      if (cv.additionalInfo.description?.trim()) {
        doc
          .font(FONT_SANS)
          .fontSize(9)
          .fillColor(COLORS.darkGray)
          .text(cv.additionalInfo.description, { lineGap: 2 });
        doc.moveDown(0.3);
      }
    }

    doc.end();
  });
}
