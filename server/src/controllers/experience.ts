import { Request, Response, NextFunction } from "express";
import Experience from "../models/Experience";
import { AppError } from "../middleware/errorHandler";

export const getExperiences = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const experiences = await Experience.find({ user: req.user!.id }).sort({ startDate: -1 });
    res.status(200).json({ experiences });
  } catch (error) {
    next(error);
  }
};

export const getExperience = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const experience = await Experience.findOne({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!experience) {
      return next(new AppError("Experience not found", 404));
    }

    res.status(200).json({ experience });
  } catch (error) {
    next(error);
  }
};

export const createExperience = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const experienceData: Record<string, unknown> = {
      user: req.user!.id,
      ...req.body,
    };

    if (req.body.currentlyWorking) {
      experienceData.endDate = undefined;
    }

    const experience = new Experience(experienceData);
    await experience.save();

    res.status(201).json({ experience });
  } catch (error) {
    next(error);
  }
};

export const updateExperience = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const updateData: Record<string, unknown> = { ...req.body };

    if (req.body.currentlyWorking === true) {
      updateData.endDate = undefined;
    }

    const experience = await Experience.findOneAndUpdate(
      { _id: req.params.id, user: req.user!.id },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!experience) {
      return next(new AppError("Experience not found", 404));
    }

    res.status(200).json({ experience });
  } catch (error) {
    next(error);
  }
};

export const deleteExperience = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const experience = await Experience.findOneAndDelete({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!experience) {
      return next(new AppError("Experience not found", 404));
    }

    res.status(200).json({ message: "Experience deleted" });
  } catch (error) {
    next(error);
  }
};
