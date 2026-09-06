import mongoose, { Schema, Document } from "mongoose";

export interface ICVProfile extends Document {
  user: mongoose.Types.ObjectId;
  title: string;
  personalInfo: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    linkedIn?: string;
    website?: string;
  };
  professionalSummary: string;
  education: {
    institution: string;
    degree: string;
    degreeType?: string;
    field?: string;
    startDate: string;
    endDate?: string;
    gradeValue?: string;
    highlights?: string[];
  }[];
  workExperience: {
    company: string;
    designation: string;
    location?: string;
    startDate: string;
    endDate?: string;
    current?: boolean;
    description?: string;
    highlights: string[];
  }[];
  skills: string[];
  projects?: {
    name: string;
    description?: string;
    githubLink?: string;
    liveLink?: string;
    highlights?: string[];
  }[];
  achievements?: string[];
  additionalInfo?: {
    bullets?: string[];
    description?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const cvProfileSchema = new Schema<ICVProfile>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "CV title is required"],
      trim: true,
      maxlength: [200, "Title must be 200 characters or less"],
    },
    personalInfo: {
      type: new Schema(
        {
          fullName: { type: String, required: true, trim: true },
          email: { type: String, required: true, trim: true },
          phone: { type: String, required: true, trim: true },
          location: { type: String, required: true, trim: true },
          linkedIn: { type: String, trim: true, default: null },
          website: { type: String, trim: true, default: null },
        },
        { _id: false }
      ),
      required: true,
    },
    professionalSummary: {
      type: String,
      trim: true,
      maxlength: [2000, "Summary must be 2000 characters or less"],
      default: "",
    },
    education: [
      new Schema(
        {
          institution: { type: String, required: true, trim: true },
          degree: { type: String, required: true, trim: true },
          degreeType: { type: String, trim: true, default: null },
          field: { type: String, trim: true, default: null },
          startDate: { type: String, required: true, trim: true },
          endDate: { type: String, trim: true, default: null },
          gradeValue: { type: String, trim: true, default: null },
          highlights: { type: [String], default: [] },
        },
        { _id: false }
      ),
    ],
    workExperience: [
      new Schema(
        {
          company: { type: String, required: true, trim: true },
          designation: { type: String, required: true, trim: true },
          location: { type: String, trim: true, default: null },
          startDate: { type: String, required: true, trim: true },
          endDate: { type: String, trim: true, default: null },
          current: { type: Boolean, default: false },
          description: { type: String, trim: true, default: null },
          highlights: { type: [String], default: [] },
        },
        { _id: false }
      ),
    ],
    skills: {
      type: [String],
      default: [],
    },
    projects: [
      new Schema(
        {
          name: { type: String, required: true, trim: true },
          description: { type: String, trim: true, default: null },
          githubLink: { type: String, trim: true, default: null },
          liveLink: { type: String, trim: true, default: null },
          highlights: { type: [String], default: [] },
        },
        { _id: false }
      ),
    ],
    achievements: {
      type: [String],
      default: [],
    },
    additionalInfo: {
      type: new Schema(
        {
          bullets: { type: [String], default: [] },
          description: { type: String, trim: true, default: "" },
        },
        { _id: false }
      ),
    },
  },
  {
    timestamps: true,
  }
);

const CVProfile = mongoose.model<ICVProfile>("CVProfile", cvProfileSchema);

export default CVProfile;
