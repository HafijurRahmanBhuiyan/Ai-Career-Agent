import { Request, Response, NextFunction } from "express";
import Profile from "../models/Profile";
import { AppError } from "../middleware/errorHandler";
import { getNotificationCenter } from "../services/notificationCenter";

export const getNotificationCenterHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await getNotificationCenter(req.user!.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const markNotificationsSeen = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const profile = await Profile.findOneAndUpdate(
      { user: req.user!.id },
      { $set: { notificationsSeenAt: new Date() } },
      { new: true }
    );
    if (!profile) {
      return next(new AppError("Profile not found. Create a profile before using notifications.", 404));
    }
    res.status(200).json({ notificationsSeenAt: profile.notificationsSeenAt });
  } catch (error) {
    next(error);
  }
};
