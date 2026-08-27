import mongoose, { Schema, Document } from "mongoose";
import { Role } from "../types";
import { hashPassword, comparePassword } from "../utils/password";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  toSafeObject(): Record<string, unknown>;
  comparePassword(candidatePassword: string, hash: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name must be 100 characters or less"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    passwordHash: {
      type: String,
      required: [true, "Password is required"],
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(Role),
      default: Role.USER,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("passwordHash")) return next();

  try {
    this.passwordHash = await hashPassword(this.passwordHash);
    next();
  } catch (error) {
    next(error as Error);
  }
});

userSchema.methods.toSafeObject = function (): Record<string, unknown> {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

userSchema.methods.comparePassword = async function (
  candidatePassword: string,
  hash: string
): Promise<boolean> {
  return comparePassword(candidatePassword, hash);
};

const User = mongoose.model<IUser>("User", userSchema);

export default User;
