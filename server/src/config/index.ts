export const CORS_ORIGIN = process.env.CLIENT_URL || "http://localhost:5173";
export const PORT = parseInt(process.env.PORT || "5001", 10);
export const NODE_ENV = process.env.NODE_ENV || "development";

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }
  return secret;
};

export const getJwtExpiresIn = (): string => {
  return process.env.JWT_EXPIRES_IN || "7d";
};
