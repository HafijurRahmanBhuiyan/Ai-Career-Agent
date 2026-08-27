import { Request, Response, NextFunction } from "express";
import User from "../models/User";
import { generateToken } from "../utils/jwt";
import { AppError } from "../middleware/errorHandler";

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return next(new AppError("Email already registered", 409));
    }

    const user = new User({
      name,
      email: email.toLowerCase(),
      passwordHash: password,
    });

    await user.save();

    const token = generateToken(user._id.toString(), user.role);

    res.status(201).json({
      user: user.toSafeObject(),
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+passwordHash"
    );

    if (!user) {
      return next(new AppError("Invalid email or password", 401));
    }

    const isPasswordValid = await user.comparePassword(
      password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      return next(new AppError("Invalid email or password", 401));
    }

    if (!user.isActive) {
      return next(new AppError("Account is inactive", 401));
    }

    const token = generateToken(user._id.toString(), user.role);

    res.status(200).json({
      user: user.toSafeObject(),
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (
  req: Request,
  res: Response
) => {
  res.status(200).json({
    user: req.user,
  });
};
