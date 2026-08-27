import { Request, Response, NextFunction } from "express";
import Profile from "../models/Profile";
import { AppError } from "../middleware/errorHandler";

export const getProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const profile = await Profile.findOne({ user: req.user!.id });

    if (!profile) {
      return next(new AppError("Profile not found", 404));
    }

    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
};

export const createProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const existing = await Profile.findOne({ user: req.user!.id });
    if (existing) {
      return next(new AppError("Profile already exists. Use PATCH to update.", 409));
    }

    const profile = new Profile({
      user: req.user!.id,
      ...req.body,
    });

    await profile.save();

    res.status(201).json({ profile });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const profile = await Profile.findOneAndUpdate(
      { user: req.user!.id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!profile) {
      return next(new AppError("Profile not found", 404));
    }

    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
};
