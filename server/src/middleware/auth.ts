import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import User from "../models/User";
import { AppError } from "./errorHandler";

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next(new AppError("No authorization header provided", 401));
    }

    if (!authHeader.startsWith("Bearer ")) {
      return next(new AppError("Malformed authorization header", 401));
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return next(new AppError("No token provided", 401));
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      return next(new AppError("Invalid or expired token", 401));
    }

    const user = await User.findById(decoded.userId).select("+passwordHash");

    if (!user) {
      return next(new AppError("User not found", 401));
    }

    if (!user.isActive) {
      return next(new AppError("Account is inactive", 401));
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };

    next();
  } catch (error) {
    next(error);
  }
};
