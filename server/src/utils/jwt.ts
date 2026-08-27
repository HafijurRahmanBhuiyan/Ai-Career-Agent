import jwt from "jsonwebtoken";
import { getJwtSecret, getJwtExpiresIn } from "../config";
import { JwtPayload } from "../types";

export const generateToken = (userId: string, role: string): string => {
  const payload: JwtPayload = { userId, role: role as JwtPayload["role"] };
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: getJwtExpiresIn(),
  } as jwt.SignOptions);
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
};
