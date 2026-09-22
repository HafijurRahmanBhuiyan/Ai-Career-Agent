import dotenv from "dotenv";
import mongoose from "mongoose";
import GitHubConnection from "../src/models/GitHubConnection";

dotenv.config();

const INDEX_NAME = "githubUserId_1";
const COLLECTION_NAME = GitHubConnection.collection.name;

const isIndexNotFoundError = (error: unknown): boolean => {
  const err = error as { code?: number; message?: string };
  return (
    err?.code === 27 || /index not found/i.test(err?.message || "")
  );
};

const run = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not defined; skipping index migration.");
    process.exit(0);
  }

  try {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("No database handle available after connecting");
    }

    const existing = (await db
      .collection(COLLECTION_NAME)
      .indexes()).find((index: { name: string }) => index.name === INDEX_NAME);

    if (!existing) {
      console.log(
        `[migration] No '${INDEX_NAME}' index found in '${COLLECTION_NAME}'; nothing to do.`
      );
      return;
    }

    await db.collection(COLLECTION_NAME).dropIndex(INDEX_NAME);
    console.log(
      `[migration] Dropped '${INDEX_NAME}' index from '${COLLECTION_NAME}'.`
    );
    console.log(
      "[migration] Run `GitHubConnection.syncIndexes()` (or restart the server) to rebuild it as a non-unique index to match the schema."
    );
  } catch (error: unknown) {
    if (isIndexNotFoundError(error)) {
      console.log(
        `[migration] '${INDEX_NAME}' index not found in '${COLLECTION_NAME}'; nothing to do.`
      );
      return;
    }
    console.error(
      "[migration] Failed to drop 'githubUserId_1' index:",
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();