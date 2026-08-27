import { Request, Response, NextFunction } from "express";
import Project from "../models/Project";
import { AppError } from "../middleware/errorHandler";

export const getProjects = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const projects = await Project.find({ user: req.user!.id }).sort({ createdAt: -1 });
    res.status(200).json({ projects });
  } catch (error) {
    next(error);
  }
};

export const getProject = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!project) {
      return next(new AppError("Project not found", 404));
    }

    res.status(200).json({ project });
  } catch (error) {
    next(error);
  }
};

export const createProject = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const project = new Project({
      user: req.user!.id,
      ...req.body,
    });

    await project.save();
    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
};

export const updateProject = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, user: req.user!.id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!project) {
      return next(new AppError("Project not found", 404));
    }

    res.status(200).json({ project });
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const project = await Project.findOneAndDelete({
      _id: req.params.id,
      user: req.user!.id,
    });

    if (!project) {
      return next(new AppError("Project not found", 404));
    }

    res.status(200).json({ message: "Project deleted" });
  } catch (error) {
    next(error);
  }
};
