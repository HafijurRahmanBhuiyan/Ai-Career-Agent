import { Request, Response, NextFunction } from "express";
import { LinkedInService } from "../services/linkedIn";
import { validateOAuthState } from "../utils/oauthState";
import { AppError } from "../middleware/errorHandler";

const linkedInService = new LinkedInService();

export const connect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { authorizeUrl, state } = linkedInService.getAuthorizeUrl(req.user!.id);
    res.status(200).json({ authorizeUrl, state });
  } catch (error) {
    next(error);
  }
};

export const callback = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { code, state } = req.query;

    if (!code || !state || typeof code !== "string" || typeof state !== "string") {
      return next(new AppError("Missing authorization code or state", 400));
    }

    const stateValidation = validateOAuthState(state);
    if (!stateValidation.valid || !stateValidation.userId) {
      return next(
        new AppError(stateValidation.error || "Invalid OAuth state", 400)
      );
    }

    await linkedInService.completeConnection(stateValidation.userId, code);

    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    res.redirect(`${clientUrl}/dashboard/integrations?linkedin=connected`);
  } catch (error) {
    next(error);
  }
};

export const disconnect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await linkedInService.disconnect(req.user!.id);
    res.status(200).json({ message: "LinkedIn account disconnected" });
  } catch (error) {
    next(error);
  }
};

export const getStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const status = await linkedInService.getStatus(req.user!.id);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
};
