import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";
import { UserMemoryCategory } from "../enums.js";

export interface IUserMemory {
  userId: Types.ObjectId;
  creatorId: Types.ObjectId;
  conversationId: Types.ObjectId;

  text: string;
  category?: UserMemoryCategory;

  qdrant: {
    collectionName: string;
    pointId: string;
    vectorModel: string;
    indexedAt?: Date;
  };

  sourceMessageIds: Types.ObjectId[];
}

export interface IUserMemoryDocument extends IUserMemory, Document {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

const userMemorySchema = new Schema<IUserMemoryDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "Creator",
      required: true,
      index: true,
    },

    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },

    text: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      enum: Object.values(UserMemoryCategory),
    },

    qdrant: {
      collectionName: { type: String, required: true },
      pointId: { type: String, required: true },
      vectorModel: { type: String, required: true },
      indexedAt: Date,
    },

    sourceMessageIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Message",
      },
    ],
  },
  { timestamps: true },
);

userMemorySchema.index({ userId: 1, creatorId: 1, createdAt: -1 });
userMemorySchema.index({ "qdrant.pointId": 1 });

export const UserMemory: Model<IUserMemoryDocument> =
  mongoose.models.UserMemory ??
  mongoose.model<IUserMemoryDocument>("UserMemory", userMemorySchema);
