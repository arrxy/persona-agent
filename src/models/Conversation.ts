import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";
import { ConversationMode } from "../enums.js";

export interface IConversation {
  userId?: Types.ObjectId;
  creatorId: Types.ObjectId;

  title?: string;

  mode: ConversationMode;
}

export interface IConversationDocument extends IConversation, Document {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversationDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "Creator",
      required: true,
      index: true,
    },

    title: {
      type: String,
      trim: true,
    },

    mode: {
      type: String,
      enum: Object.values(ConversationMode),
      default: ConversationMode.CHAT,
      required: true,
    },
  },
  { timestamps: true },
);

conversationSchema.index({ userId: 1, updatedAt: -1 });
conversationSchema.index({ creatorId: 1, updatedAt: -1 });

export const Conversation: Model<IConversationDocument> = mongoose.models.Conversation ?? mongoose.model<IConversationDocument>("Conversation", conversationSchema);