import mongoose from "mongoose";

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
