import mongoose, { Schema, Document } from "mongoose";

export interface IEducation extends Document {
  user: mongoose.Types.ObjectId;
  degree: string;
  institution: string;
  field?: string;
  startDate: Date;
  endDate?: Date;
  grade?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const educationSchema = new Schema<IEducation>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    degree: {
      type: String,
      required: [true, "Degree is required"],
      trim: true,
      maxlength: [200, "Degree must be 200 characters or less"],
    },
    institution: {
      type: String,
      required: [true, "Institution is required"],
      trim: true,
      maxlength: [200, "Institution must be 200 characters or less"],
    },
    field: {
      type: String,
      trim: true,
      maxlength: [200, "Field must be 200 characters or less"],
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
    },
    grade: {
      type: String,
      trim: true,
      maxlength: [50, "Grade must be 50 characters or less"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, "Description must be 2000 characters or less"],
    },
  },
  {
    timestamps: true,
  }
);

const Education = mongoose.model<IEducation>("Education", educationSchema);

export default Education;
