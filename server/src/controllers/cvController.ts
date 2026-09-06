import { Request, Response, NextFunction } from "express";
import CVProfile from "../models/CVProfile";
import { AppError } from "../middleware/errorHandler";
import { generateCvPdf } from "../services/cvPdf";

export const getCVProfiles = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const profiles = await CVProfile.find({ user: req.user!.id }).sort({ updatedAt: -1 });
    res.status(200).json({ profiles });
  } catch (error) {
    next(error);
  }
};

export const getCVProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const profile = await CVProfile.findOne({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!profile) {
      return next(new AppError("CV profile not found", 404));
    }

    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
};

export const createCVProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const profile = new CVProfile({
      user: req.user!.id,
      ...req.body,
    });
    await profile.save();

    res.status(201).json({ profile });
  } catch (error) {
    next(error);
  }
};

export const updateCVProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const profile = await CVProfile.findOneAndUpdate(
      { _id: req.params.id, user: req.user!.id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!profile) {
      return next(new AppError("CV profile not found", 404));
    }

    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
};

export const deleteCVProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const profile = await CVProfile.findOneAndDelete({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!profile) {
      return next(new AppError("CV profile not found", 404));
    }

    res.status(200).json({ message: "CV profile deleted" });
  } catch (error) {
    next(error);
  }
};

export const generateCVPdf = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const profile = await CVProfile.findOne({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!profile) {
      return next(new AppError("CV profile not found", 404));
    }

    const pdfBuffer = await generateCvPdf(profile);
    const filename = `${profile.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};
