import { Request, Response, NextFunction } from "express";
import Skill from "../models/Skill";
import { AppError } from "../middleware/errorHandler";

export const getSkills = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const skills = await Skill.find({ user: req.user!.id }).sort({ name: 1 });
    res.status(200).json({ skills });
  } catch (error) {
    next(error);
  }
};

export const getSkill = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const skill = await Skill.findOne({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!skill) {
      return next(new AppError("Skill not found", 404));
    }

    res.status(200).json({ skill });
  } catch (error) {
    next(error);
  }
};

export const createSkill = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const normalizedName = req.body.name.trim().toLowerCase();

    const existing = await Skill.findOne({
      user: req.user!.id,
      name: normalizedName,
    });

    if (existing) {
      return next(new AppError("Skill already exists", 409));
    }

    const skill = new Skill({
      user: req.user!.id,
      ...req.body,
      name: normalizedName,
    });

    await skill.save();
    res.status(201).json({ skill });
  } catch (error) {
    next(error);
  }
};

export const updateSkill = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const updateData: Record<string, unknown> = { ...req.body };

    if (updateData.name) {
      updateData.name = (updateData.name as string).trim().toLowerCase();
    }

    const skill = await Skill.findOneAndUpdate(
      { _id: req.params.id, user: req.user!.id },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!skill) {
      return next(new AppError("Skill not found", 404));
    }

    res.status(200).json({ skill });
  } catch (error) {
    next(error);
  }
};

export const deleteSkill = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const skill = await Skill.findOneAndDelete({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!skill) {
      return next(new AppError("Skill not found", 404));
    }

    res.status(200).json({ message: "Skill deleted" });
  } catch (error) {
    next(error);
  }
};
