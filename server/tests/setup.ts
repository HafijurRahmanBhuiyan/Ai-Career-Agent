import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongo: MongoMemoryServer;

export const connectTestDB = async () => {
  process.env.JWT_SECRET = "test-secret-key-for-jwt";
  process.env.JWT_EXPIRES_IN = "1h";
  process.env.NODE_ENV = "test";

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
