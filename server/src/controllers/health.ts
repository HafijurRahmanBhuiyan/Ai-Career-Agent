import { Request, Response } from "express";
import { isDatabaseConnected } from "../config/database";

export const healthCheck = (_req: Request, res: Response) => {
  const dbStatus = isDatabaseConnected() ? "connected" : "disconnected";

  res.status(200).json({
    status: "healthy",
    service: "AI Career Agent API",
    database: dbStatus,
  });
};
