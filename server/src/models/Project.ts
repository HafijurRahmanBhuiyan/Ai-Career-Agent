import mongoose, { Schema, Document } from "mongoose";

export interface IProject extends Document {
  user: mongoose.Types.ObjectId;
  name: string;
  description: string;
  technologies: string[];
  features: string[];
  role?: string;
  githubUrl?: string;
  liveUrl?: string;
  startDate?: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Project name is required"],
      trim: true,
      maxlength: [200, "Project name must be 200 characters or less"],
    },
    description: {
      type: String,
      required: [true, "Project description is required"],
      trim: true,
      maxlength: [5000, "Description must be 5000 characters or less"],
    },
    technologies: {
      type: [String],
      default: [],
    },
    features: {
      type: [String],
      default: [],
    },
    role: {
      type: String,
      trim: true,
      maxlength: [200, "Role must be 200 characters or less"],
    },
    githubUrl: {
      type: String,
      trim: true,
      match: [/^https:\/\/.+/, "Invalid GitHub URL"],
    },
    liveUrl: {
      type: String,
      trim: true,
      match: [/^https:\/\/.+/, "Invalid live URL"],
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const Project = mongoose.model<IProject>("Project", projectSchema);

export default Project;
