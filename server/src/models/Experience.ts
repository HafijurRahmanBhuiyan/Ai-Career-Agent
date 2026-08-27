import mongoose, { Schema, Document } from "mongoose";

export interface IExperience extends Document {
  user: mongoose.Types.ObjectId;
  company: string;
  position: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  currentlyWorking: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const experienceSchema = new Schema<IExperience>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    company: {
      type: String,
      required: [true, "Company is required"],
      trim: true,
      maxlength: [200, "Company must be 200 characters or less"],
    },
    position: {
      type: String,
      required: [true, "Position is required"],
      trim: true,
      maxlength: [200, "Position must be 200 characters or less"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [5000, "Description must be 5000 characters or less"],
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
    },
    currentlyWorking: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Experience = mongoose.model<IExperience>("Experience", experienceSchema);

export default Experience;
