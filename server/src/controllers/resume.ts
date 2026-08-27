import { Request, Response, NextFunction } from "express";
import Resume from "../models/Resume";
import { AppError } from "../middleware/errorHandler";

export const getResumes = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const resumes = await Resume.find({ user: req.user!.id }).sort({ createdAt: -1 });
    res.status(200).json({ resumes });
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

    res.status(200).json({ resume });
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

    res.status(201).json({ resume });
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

    res.status(200).json({ resume });
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

    res.status(200).json({ message: "Resume deleted" });
  } catch (error) {
    next(error);
  }
};
