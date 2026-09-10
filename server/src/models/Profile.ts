import mongoose, { Schema, Document } from "mongoose";

export interface IWorkExperience {
  company: string;
  designation: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
  highlights: string[];
}

export interface IEducation {
  level: "ssc" | "hsc" | "bachelor" | "master";
  institution: string;
  degree: string;
  fieldOfStudy: string;
  session: string;
  passingYear: string;
  gpa: string;
  cgpa: string;
  startDate: string;
  endDate: string;
  certificateFileName: string | null;
  certificateFileId: string | null;
}

export interface IProfile extends Document {
  user: mongoose.Types.ObjectId;
  fullName?: string;
  email?: string;
  headline?: string;
  summary?: string;
  phone?: string;
  location?: string;
  skills: string[];
  salaryExpectation?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  workExperience: IWorkExperience[];
  education: IEducation[];
  cvFileName?: string;
  cvFileId?: string;
  preferredRoles: string[];
  preferredLocations: string[];
  workPreference?: string;
  jobSearchPreferences?: {
    roles: string[];
    locations: string[];
    remote?: string;
    experienceLevel?: string;
    salaryMinimum?: number;
  };
  notificationEmail?: string;
  gmailNotifyEnabled?: boolean;
  gmailAutoStatusEnabled?: boolean;
  notificationsSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const profileSchema = new Schema<IProfile>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      trim: true,
      maxlength: [200, "Full name must be 200 characters or less"],
    },
    email: {
      type: String,
      trim: true,
      maxlength: [320, "Email must be 320 characters or less"],
    },
    headline: {
      type: String,
      trim: true,
      maxlength: [300, "Headline must be 300 characters or less"],
    },
    summary: {
      type: String,
      trim: true,
      maxlength: [5000, "Summary must be 5000 characters or less"],
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [30, "Phone must be 30 characters or less"],
    },
    location: {
      type: String,
      trim: true,
      maxlength: [200, "Location must be 200 characters or less"],
    },
    skills: {
      type: [String],
      default: [],
    },
    workExperience: [
      new Schema(
        {
          company: { type: String, trim: true, default: "" },
          designation: { type: String, trim: true, default: "" },
          location: { type: String, trim: true, default: "" },
          startDate: { type: String, trim: true, default: "" },
          endDate: { type: String, trim: true, default: "" },
          current: { type: Boolean, default: false },
          description: { type: String, trim: true, default: "" },
          highlights: { type: [String], default: [] },
        },
        { _id: false }
      ),
    ],
    education: [
      new Schema(
        {
          level: {
            type: String,
            enum: ["ssc", "hsc", "bachelor", "master"],
            required: true,
          },
          institution: { type: String, trim: true, default: "" },
          degree: { type: String, trim: true, default: "" },
          fieldOfStudy: { type: String, trim: true, default: "" },
          session: { type: String, trim: true, default: "" },
          passingYear: { type: String, trim: true, default: "" },
          gpa: { type: String, trim: true, default: "" },
          cgpa: { type: String, trim: true, default: "" },
          startDate: { type: String, trim: true, default: "" },
          endDate: { type: String, trim: true, default: "" },
          certificateFileName: { type: String, default: null },
          certificateFileId: { type: String, default: null },
        },
        { _id: false }
      ),
    ],
    cvFileName: {
      type: String,
      default: null,
    },
    cvFileId: {
      type: String,
      default: null,
    },
    preferredRoles: {
      type: [String],
      default: [],
    },
    preferredLocations: {
      type: [String],
      default: [],
    },
    workPreference: {
      type: String,
      enum: ["remote", "hybrid", "onsite", ""],
      default: "",
    },
    salaryExpectation: {
      min: { type: Number },
      max: { type: Number },
      currency: {
        type: String,
        trim: true,
        maxlength: [3, "Currency must be 3 characters or less"],
      },
    },
    jobSearchPreferences: {
      type: new Schema(
        {
          roles: { type: [String], default: [] },
          locations: { type: [String], default: [] },
          remote: { type: String, default: "any" },
          experienceLevel: { type: String, default: "" },
          salaryMinimum: { type: Number, default: null },
        },
        { _id: false }
      ),
      default: {},
    },
    notificationEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [320, "Notification email must be 320 characters or less"],
    },
    gmailNotifyEnabled: {
      type: Boolean,
      default: true,
    },
    gmailAutoStatusEnabled: {
      type: Boolean,
      default: false,
    },
    notificationsSeenAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Profile = mongoose.model<IProfile>("Profile", profileSchema);

export default Profile;
