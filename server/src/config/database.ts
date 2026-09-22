import mongoose from "mongoose";
import GitHubConnection from "../models/GitHubConnection";

let isConnected = false;

export const connectDatabase = async (uri?: string): Promise<void> => {
  const mongoUri = uri || process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined in environment variables");
  }

  try {
    await mongoose.connect(mongoUri);
    isConnected = true;
    console.log("✅ MongoDB connected successfully");

    try {
      // Reconcile collection indexes with the schema so a fresh deployment
      // self-heals without a manual step (e.g. GitHubConnection.githubUserId
      // is indexed but no longer globally unique). The per-user `user_1`
      // unique index is part of the schema and is preserved. A failed index
      // sync must never prevent the server from booting.
      await GitHubConnection.syncIndexes();
      console.log("✅ GitHub connection indexes synchronized");
    } catch (error) {
      console.error(
        "⚠️ GitHub connection index sync failed:",
        error instanceof Error ? error.message : error
      );
    }
  } catch (error) {
    isConnected = false;
    console.error("❌ MongoDB connection failed:", error instanceof Error ? error.message : error);
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  if (!isConnected) return;

  await mongoose.disconnect();
  isConnected = false;
  console.log("MongoDB disconnected");
};

export const isDatabaseConnected = (): boolean => {
  return isConnected && mongoose.connection.readyState === 1;
};
