import { Request, Response, NextFunction } from "express";
import { ApplicationExecutionService } from "../services/applicationExecution";
import { assistJobFit } from "../services/jobFitAssist";

const executionService = new ApplicationExecutionService();

function parseId(raw: string | string[] | undefined): string {
  return Array.isArray(raw) ? raw[0] : raw || "";
}

export const getExecutionInfo = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await executionService.getExecutionInfo(
      req.user!.id,
      parseId(req.params.id)
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const prepareExecution = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await executionService.prepare(
      req.user!.id,
      parseId(req.params.id)
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const executeApplication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await executionService.execute(
      req.user!.id,
      parseId(req.params.id),
      { submitted: req.body.submitted }
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const assistApplicationFit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await assistJobFit(
      req.user!.id,
      parseId(req.params.id)
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
