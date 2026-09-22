import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongo: MongoMemoryServer;

export const connectTestDB = async () => {
  process.env.JWT_SECRET = "test-secret-key-for-jwt";
  process.env.JWT_EXPIRES_IN = "1h";
  process.env.NODE_ENV = "test";

  // Default AI provider key so AI-feature tests are deterministic. Tests that
  // specifically exercise no-key behavior call clearKeys() themselves. The AI
  // clients are mocked in the suites that exercise analysis endpoints.
  process.env.ANTHROPIC_API_KEY = "test-ai-key";

  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  await mongoose.connect(uri);
};

export const disconnectTestDB = async () => {
  await mongoose.disconnect();
  await mongo.stop();
};

export const clearTestDB = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
};
