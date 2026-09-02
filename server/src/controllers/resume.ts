import { Request, Response, NextFunction } from "express";
import Resume from "../models/Resume";
import { AppError } from "../middleware/errorHandler";
import {
  processResumeUpload,
  toSafeResume,
} from "../services/resumeIngestion";
import { getResumeFile } from "../services/resumeStorage";

export const getResumes = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const resumes = await Resume.find({ user: req.user!.id }).sort({ createdAt: -1 });
    res.status(200).json({ resumes: resumes.map((r) => toSafeResume(r as never)) });
  } catch (error) {
    next(error);
  }
};

export const getResume = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const resume = await Resume.findOne({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!resume) {
      return next(new AppError("Resume not found", 404));
    }

    res.status(200).json({ resume: toSafeResume(resume as never) });
  } catch (error) {
    next(error);
  }
};

export const createResume = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const resumeData = {
      user: req.user!.id,
      ...req.body,
    };

    if (resumeData.isActive === true) {
      await Resume.updateMany(
        { user: req.user!.id, isActive: true },
        { $set: { isActive: false } }
      );
    }

    const resume = new Resume(resumeData);
    await resume.save();

    res.status(201).json({ resume: toSafeResume(resume as never) });
  } catch (error) {
    next(error);
  }
};

export const updateResume = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const existing = await Resume.findOne({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!existing) {
      return next(new AppError("Resume not found", 404));
    }

    if (req.body.isActive === true && !existing.isActive) {
      await Resume.updateMany(
        { user: req.user!.id, isActive: true, _id: { $ne: existing._id } },
        { $set: { isActive: false } }
      );
    }

    const resume = await Resume.findOneAndUpdate(
      { _id: req.params.id, user: req.user!.id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    res.status(200).json({ resume: toSafeResume(resume as never) });
  } catch (error) {
    next(error);
  }
};

export const deleteResume = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const resume = await Resume.findOneAndDelete({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!resume) {
      return next(new AppError("Resume not found", 404));
    }

    if (resume.fileId) {
      await import("../services/resumeStorage").then(({ deleteResumeFile }) =>
        deleteResumeFile(String(resume.fileId)).catch(() => false)
      );
    }

    res.status(200).json({ message: "Resume deleted" });
  } catch (error) {
    next(error);
  }
};

/**
 * (Phase 2, Step 3) Upload a resume document: store it (GridFS), extract bounded
 * text, derive structured evidence, and persist on the existing Resume model.
 * Requires multipart form field "file". Privacy-safe response omits raw text and
 * the GridFS file id.
 */
export const uploadResumeFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      return next(new AppError("A resume file is required", 400));
    }

    const resume = await processResumeUpload({
      userId: req.user!.id,
      resumeId: String(req.params.id),
      originalName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
    });

    res.status(200).json({ resume: toSafeResume(resume as never) });
  } catch (error) {
    next(error);
  }
};

/**
 * (Phase 2, Step 3) Download the user's own resume document bytes (authenticated,
 * ownership-checked). Storage is internal GridFS; no storage URL is ever exposed.
 */
export const downloadResumeFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const resume = await Resume.findOne({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!resume) {
      return next(new AppError("Resume not found", 404));
    }
    if (!resume.fileId) {
      return next(new AppError("Resume has no uploaded file", 404));
    }

    const file = await getResumeFile(resume.fileId);
    if (!file) {
      return next(new AppError("Resume file not found", 404));
    }

    res.setHeader("Content-Type", file.contentType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${(resume.fileName || "resume").replace(/"/g, "")}"`
    );
    res.send(file.buffer);
  } catch (error) {
    next(error);
  }
};
