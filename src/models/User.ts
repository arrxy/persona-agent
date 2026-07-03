import mongoose, { Schema, type Document, type Model } from "mongoose";
import { AuthProvider } from "../enums.js";

export interface IUser {
  email: string;
  password?: string;
  name: string;
  googleId?: string;
  authProvider: AuthProvider;
  avatarUrl?: string;
}

export interface IUserDocument extends IUser, Document {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      select: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    authProvider: {
      type: String,
      enum: Object.values(AuthProvider),
      required: true,
    },
    avatarUrl: String,
  },
  { timestamps: true },
);

userSchema.methods.comparePassword = async function comparePassword(
  candidate: string,
): Promise<boolean> {
  if (!this.password) {
    return false;
  }

  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(candidate, this.password);
};

userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password") || !this.password) {
    return;
  }

  const bcrypt = await import("bcryptjs");
  this.password = await bcrypt.hash(this.password, 12);
});

export const User: Model<IUserDocument> =
  mongoose.models.User ?? mongoose.model<IUserDocument>("User", userSchema);
