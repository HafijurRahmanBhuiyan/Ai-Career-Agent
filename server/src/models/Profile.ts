import mongoose, { Schema, Document } from "mongoose";

export interface IProfile extends Document {
  user: mongoose.Types.ObjectId;
  fullName?: string;
  headline?: string;
  summary?: string;
  phone?: string;
  location?: string;
  preferredRoles: string[];
  preferredLocations: string[];
  workPreference?: string;
  salaryExpectation?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  jobSearchPreferences?: {
    roles: string[];
    locations: string[];
    remote?: string;
    experienceLevel?: string;
    salaryMinimum?: number;
  };
  notificationEmail?: string;
  gmailNotifyEnabled?: boolean;
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
