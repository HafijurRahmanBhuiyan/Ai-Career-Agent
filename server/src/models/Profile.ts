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
  },
  {
    timestamps: true,
  }
);

const Profile = mongoose.model<IProfile>("Profile", profileSchema);

export default Profile;
