import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Profile from "../models/Profile";
import { AppError } from "../middleware/errorHandler";
import {
  extractTextFromCertificate,
  parseCertificateWithAI,
} from "../services/certificateExtraction";

function getCertificateBucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database connection is not established");
  return new mongoose.mongo.GridFSBucket(db as never, {
    bucketName: "certificates",
  });
}

function getCvBucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database connection is not established");
  return new mongoose.mongo.GridFSBucket(db as never, {
    bucketName: "cvs",
  });
}

export const getProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const profile = await Profile.findOne({ user: req.user!.id });

    if (!profile) {
      return next(new AppError("Profile not found", 404));
    }

    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
};

export const createProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const existing = await Profile.findOne({ user: req.user!.id });
    if (existing) {
      return next(new AppError("Profile already exists. Use PATCH to update.", 409));
    }

    const profile = new Profile({
      user: req.user!.id,
      ...req.body,
    });

    await profile.save();

    res.status(201).json({ profile });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const profile = await Profile.findOneAndUpdate(
      { user: req.user!.id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!profile) {
      return next(new AppError("Profile not found", 404));
    }

    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
};

export const uploadCertificate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const index = parseInt(String(req.params.index), 10);
    if (isNaN(index) || index < 0) {
      return next(new AppError("Invalid education index", 400));
    }

    const file = req.file;
    if (!file) {
      return next(new AppError("No file uploaded", 400));
    }

    const profile = await Profile.findOne({ user: req.user!.id });
    if (!profile) {
      return next(new AppError("Profile not found", 404));
    }

    if (index >= profile.education.length) {
      return next(new AppError("Education index out of range", 400));
    }

    // Delete old certificate file if one exists
    const oldEntry = profile.education[index];
    if (oldEntry.certificateFileId) {
      try {
        const bucket = getCertificateBucket();
        const id = new mongoose.mongo.ObjectId(oldEntry.certificateFileId);
        await bucket.delete(id as never);
      } catch {
        // old file may already be deleted
      }
    }

    // Save new file to GridFS
    const bucket = getCertificateBucket();
    const fileId = await new Promise<mongoose.Types.ObjectId>(
      (resolve, reject) => {
        const uploadStream = bucket.openUploadStream(file.originalname, {
          metadata: {
            user: new mongoose.mongo.ObjectId(req.user!.id),
            contentType: file.mimetype,
          },
        });
        uploadStream.on("error", reject);
        uploadStream.on("finish", () => {
          resolve(uploadStream.id as unknown as mongoose.Types.ObjectId);
        });
        uploadStream.end(file.buffer);
      }
    );

    // Extract text and parse with AI
    const text = await extractTextFromCertificate({
      buffer: file.buffer,
      originalName: file.originalname,
    });

    const extracted = await parseCertificateWithAI(
      text,
      oldEntry.level
    );

    // Update the education entry
    profile.education[index].certificateFileName = file.originalname;
    profile.education[index].certificateFileId = String(fileId);

    // Auto-fill fields from extracted data (only fill empty fields)
    if (extracted.institution && !profile.education[index].institution) {
      profile.education[index].institution = extracted.institution;
    }
    if (extracted.degree && !profile.education[index].degree) {
      profile.education[index].degree = extracted.degree;
    }
    if (extracted.fieldOfStudy && !profile.education[index].fieldOfStudy) {
      profile.education[index].fieldOfStudy = extracted.fieldOfStudy;
    }
    if (extracted.session && !profile.education[index].session) {
      profile.education[index].session = extracted.session;
    }
    if (extracted.passingYear && !profile.education[index].passingYear) {
      profile.education[index].passingYear = extracted.passingYear;
    }
    if (extracted.gpa && !profile.education[index].gpa) {
      profile.education[index].gpa = extracted.gpa;
    }
    if (extracted.cgpa && !profile.education[index].cgpa) {
      profile.education[index].cgpa = extracted.cgpa;
    }
    if (extracted.startDate && !profile.education[index].startDate) {
      profile.education[index].startDate = extracted.startDate;
    }
    if (extracted.endDate && !profile.education[index].endDate) {
      profile.education[index].endDate = extracted.endDate;
    }

    await profile.save();

    res.status(200).json({
      profile,
      extracted,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCertificate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const index = parseInt(String(req.params.index), 10);
    if (isNaN(index) || index < 0) {
      return next(new AppError("Invalid education index", 400));
    }

    const profile = await Profile.findOne({ user: req.user!.id });
    if (!profile) {
      return next(new AppError("Profile not found", 404));
    }

    if (index >= profile.education.length) {
      return next(new AppError("Education index out of range", 400));
    }

    const entry = profile.education[index];
    if (entry.certificateFileId) {
      try {
        const bucket = getCertificateBucket();
        const id = new mongoose.mongo.ObjectId(entry.certificateFileId);
        await bucket.delete(id as never);
      } catch {
        // file may already be deleted
      }
    }

    profile.education[index].certificateFileName = null;
    profile.education[index].certificateFileId = null;
    await profile.save();

    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
};

export const getCertificate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const index = parseInt(String(req.params.index), 10);
    if (isNaN(index) || index < 0) {
      return next(new AppError("Invalid education index", 400));
    }

    const profile = await Profile.findOne({ user: req.user!.id });
    if (!profile) {
      return next(new AppError("Profile not found", 404));
    }

    if (index >= profile.education.length) {
      return next(new AppError("Education index out of range", 400));
    }

    const entry = profile.education[index];
    if (!entry.certificateFileId) {
      return next(new AppError("Certificate not found", 404));
    }

    const bucket = getCertificateBucket();
    const id = new mongoose.mongo.ObjectId(entry.certificateFileId);

    const files = await bucket.find({ _id: id as never }).limit(1).toArray();
    if (!files || files.length === 0) {
      return next(new AppError("Certificate file not found", 404));
    }

    const file = files[0];
    const contentType =
      (file.metadata as Record<string, unknown> | null | undefined)
        ?.contentType as string | undefined;

    res.setHeader("Content-Type", contentType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${file.filename}"`
    );

    const stream = bucket.openDownloadStream(id as never);
    stream.on("error", () => {
      res.status(404).json({ error: "Certificate file not found" });
    });
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

export const uploadCv = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const file = req.file;
    if (!file) {
      return next(new AppError("No file uploaded", 400));
    }

    let profile = await Profile.findOne({ user: req.user!.id });
    if (!profile) {
      profile = new Profile({ user: req.user!.id });
    }

    // Delete old CV file if one exists
    if (profile.cvFileId) {
      try {
        const bucket = getCvBucket();
        const id = new mongoose.mongo.ObjectId(profile.cvFileId);
        await bucket.delete(id as never);
      } catch {
        // old file may already be deleted
      }
    }

    // Save new file to GridFS
    const bucket = getCvBucket();
    const fileId = await new Promise<mongoose.Types.ObjectId>(
      (resolve, reject) => {
        const uploadStream = bucket.openUploadStream(file.originalname, {
          metadata: {
            user: new mongoose.mongo.ObjectId(req.user!.id),
            contentType: file.mimetype,
          },
        });
        uploadStream.on("error", reject);
        uploadStream.on("finish", () => {
          resolve(uploadStream.id as unknown as mongoose.Types.ObjectId);
        });
        uploadStream.end(file.buffer);
      }
    );

    profile.cvFileName = file.originalname;
    profile.cvFileId = String(fileId);
    await profile.save();

    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
};

export const getCv = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const profile = await Profile.findOne({ user: req.user!.id });
    if (!profile || !profile.cvFileId) {
      return next(new AppError("CV not found", 404));
    }

    const bucket = getCvBucket();
    const id = new mongoose.mongo.ObjectId(profile.cvFileId);

    const files = await bucket.find({ _id: id as never }).limit(1).toArray();
    if (!files || files.length === 0) {
      return next(new AppError("CV file not found", 404));
    }

    const file = files[0];
    const contentType =
      (file.metadata as Record<string, unknown> | null | undefined)
        ?.contentType as string | undefined;

    res.setHeader("Content-Type", contentType || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${file.filename}"`
    );

    const stream = bucket.openDownloadStream(id as never);
    stream.on("error", () => {
      res.status(404).json({ error: "CV file not found" });
    });
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

export const deleteCv = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const profile = await Profile.findOne({ user: req.user!.id });
    if (!profile) {
      return next(new AppError("Profile not found", 404));
    }

    if (profile.cvFileId) {
      try {
        const bucket = getCvBucket();
        const id = new mongoose.mongo.ObjectId(profile.cvFileId);
        await bucket.delete(id as never);
      } catch {
        // file may already be deleted
      }
    }

    profile.cvFileName = undefined;
    profile.cvFileId = undefined;
    await profile.save();

    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
};
