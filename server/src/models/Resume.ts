import mongoose, { Schema, Document } from "mongoose";

export interface IResume extends Document {
  user: mongoose.Types.ObjectId;
  title: string;
  fileName: string;
  fileUrl?: string;
  version: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const resumeSchema = new Schema<IResume>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Resume title is required"],
      trim: true,
      maxlength: [200, "Title must be 200 characters or less"],
    },
    fileName: {
      type: String,
      required: [true, "File name is required"],
      trim: true,
      maxlength: [255, "File name must be 255 characters or less"],
    },
    fileUrl: {
      type: String,
      trim: true,
    },
    version: {
      type: Number,
      default: 1,
      min: [1, "Version must be at least 1"],
    },
    isActive: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Resume = mongoose.model<IResume>("Resume", resumeSchema);

export default Resume;
