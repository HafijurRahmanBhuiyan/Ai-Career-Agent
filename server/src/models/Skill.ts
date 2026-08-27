import mongoose, { Schema, Document } from "mongoose";

export enum SkillCategory {
  PROGRAMMING = "Programming",
  FRAMEWORK = "Framework",
  DATABASE = "Database",
  CLOUD = "Cloud",
  DEVOPS = "DevOps",
  AI = "AI",
  SOFT_SKILL = "Soft Skill",
  OTHER = "Other",
}

export enum Proficiency {
  BEGINNER = "Beginner",
  INTERMEDIATE = "Intermediate",
  ADVANCED = "Advanced",
  EXPERT = "Expert",
}

export interface ISkill extends Document {
  user: mongoose.Types.ObjectId;
  name: string;
  category: SkillCategory;
  proficiency: Proficiency;
  createdAt: Date;
  updatedAt: Date;
}

const skillSchema = new Schema<ISkill>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Skill name is required"],
      trim: true,
      maxlength: [100, "Skill name must be 100 characters or less"],
    },
    category: {
      type: String,
      enum: Object.values(SkillCategory),
      default: SkillCategory.OTHER,
    },
    proficiency: {
      type: String,
      enum: Object.values(Proficiency),
      default: Proficiency.INTERMEDIATE,
    },
  },
  {
    timestamps: true,
  }
);

skillSchema.index({ user: 1, name: 1 }, { unique: true });

const Skill = mongoose.model<ISkill>("Skill", skillSchema);

export default Skill;
