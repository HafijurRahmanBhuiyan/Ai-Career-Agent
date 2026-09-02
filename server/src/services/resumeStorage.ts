import mongoose from "mongoose";

/**
 * (Phase 2, Step 3) Resume document storage abstraction backed by MongoDB
 * GridFS, so the app is self-contained (no external S3/storage dependency) and
 * storage URLs never leak to the client. The bucket, file ids and ownership are
 * the only references kept; raw files are never served to the public.
 *
 * Uses `mongoose.mongo.GridFSBucket` (the driver bundled with mongoose) so the
 * bucket operates on the exact same mongodb/BSON instance as the active
 * connection — importing GridFSBucket from the standalone `mongodb` package
 * caused a cross-copy BSON incompatibility.
 */

export const MAX_RESUME_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

type GridFSBucketInstance = InstanceType<typeof mongoose.mongo.GridFSBucket>;
type ObjectIdInstance = mongoose.mongo.ObjectId;

export type StoredResumeFile = {
  fileId: mongoose.Types.ObjectId;
  length: number;
  contentType?: string;
  filename: string;
};

function getBucket(): GridFSBucketInstance {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Database connection is not established");
  }
  return new mongoose.mongo.GridFSBucket(db as never, { bucketName: "resumes" });
}

export function assertAllowedResumeSize(buffer: Buffer): void {
  if (!buffer || buffer.length > MAX_RESUME_FILE_BYTES) {
    throw new Error(
      `Resume file exceeds the maximum allowed size of ${MAX_RESUME_FILE_BYTES} bytes`
    );
  }
}

export async function saveResumeFile(input: {
  userId: string | mongoose.Types.ObjectId;
  originalName: string;
  mimeType?: string;
  buffer: Buffer;
}): Promise<StoredResumeFile> {
  assertAllowedResumeSize(input.buffer);
  const bucket = getBucket();

  return new Promise((resolve, reject) => {
    const contentType = input.mimeType || "application/octet-stream";
    const uploadStream = bucket.openUploadStream(input.originalName, {
      metadata: {
        user: new mongoose.mongo.ObjectId(String(input.userId)),
        contentType,
      },
    });
    uploadStream.on("error", reject);
    uploadStream.on("finish", () => {
      resolve({
        fileId: uploadStream.id as unknown as mongoose.Types.ObjectId,
        length: uploadStream.length,
        contentType,
        filename: uploadStream.filename,
      });
    });
    if (input.buffer.length > 0) {
      uploadStream.end(input.buffer);
    } else {
      uploadStream.end();
    }
  });
}

export async function getResumeFile(
  fileId: string | mongoose.Types.ObjectId
): Promise<{ buffer: Buffer; length: number; contentType?: string; filename: string } | null> {
  const bucket = getBucket();
  const id = new mongoose.mongo.ObjectId(String(fileId)) as unknown as ObjectIdInstance;

  const files = await bucket
    .find({ _id: id as never })
    .limit(1)
    .toArray();
  if (!files || files.length === 0) {
    return null;
  }
  const file = files[0];

  const contentType = (
    (file.metadata as Record<string, unknown> | null | undefined)
      ?.contentType as string | undefined
  );

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = bucket.openDownloadStream(id as never);
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => {
      resolve({
        buffer: Buffer.concat(chunks),
        length: file.length,
        contentType,
        filename: file.filename,
      });
    });
  });
}

export async function deleteResumeFile(
  fileId: string | mongoose.Types.ObjectId
): Promise<boolean> {
  try {
    const bucket = getBucket();
    const id = new mongoose.mongo.ObjectId(String(fileId)) as unknown as ObjectIdInstance;
    await bucket.delete(id as never);
    return true;
  } catch {
    return false;
  }
}
