import { Request, Response, NextFunction } from "express";
import Education from "../models/Education";
import { AppError } from "../middleware/errorHandler";

export const getEducations = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const educations = await Education.find({ user: req.user!.id }).sort({ startDate: -1 });
    res.status(200).json({ educations });
  } catch (error) {
    next(error);
  }
};

export const getEducation = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const education = await Education.findOne({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!education) {
      return next(new AppError("Education not found", 404));
    }

    res.status(200).json({ education });
  } catch (error) {
    next(error);
  }
};

export const createEducation = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const education = new Education({
      user: req.user!.id,
      ...req.body,
    });

    await education.save();
    res.status(201).json({ education });
  } catch (error) {
    next(error);
  }
};

export const updateEducation = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const education = await Education.findOneAndUpdate(
      { _id: req.params.id, user: req.user!.id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!education) {
      return next(new AppError("Education not found", 404));
    }

    res.status(200).json({ education });
  } catch (error) {
    next(error);
  }
};

export const deleteEducation = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const education = await Education.findOneAndDelete({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!education) {
      return next(new AppError("Education not found", 404));
    }

    res.status(200).json({ message: "Education deleted" });
  } catch (error) {
    next(error);
  }
};
