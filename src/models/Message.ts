import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";
import { ImpersonationRisk, MessageRole } from "../enums.js";

export interface IMessage {
  conversationId: Types.ObjectId;
  creatorId: Types.ObjectId;
  userId?: Types.ObjectId;

  role: MessageRole;
  content: string;

  retrieval?: {
    query?: string;
    retrievedChunkIds: Types.ObjectId[];
    retrievedFactIds: Types.ObjectId[];
    score?: number;
    modelUsed?: string;
  };

  generation?: {
    model?: string;
    temperature?: number;
    promptVersion?: string;
    personaProfileVersion?: number;
  };

  safety?: {
    impersonationRisk?: ImpersonationRisk;
    usedDisclaimer?: boolean;
  };
}

export interface IMessageDocument extends IMessage, Document {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessageDocument>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "Creator",
      required: true,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    role: {
      type: String,
      enum: Object.values(MessageRole),
      required: true,
    },

    content: {
      type: String,
      required: true,
    },

    retrieval: {
      query: String,
      retrievedChunkIds: [
        {
          type: Schema.Types.ObjectId,
          ref: "TranscriptChunk",
        },
      ],
      retrievedFactIds: [
        {
          type: Schema.Types.ObjectId,
          ref: "CreatorFact",
        },
      ],
      score: Number,
      modelUsed: String,
    },

    generation: {
      model: String,
      temperature: Number,
      promptVersion: String,
      personaProfileVersion: Number,
    },

    safety: {
      impersonationRisk: {
        type: String,
        enum: Object.values(ImpersonationRisk),
      },
      usedDisclaimer: Boolean,
    },
  },
  { timestamps: true },
);

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ creatorId: 1, createdAt: -1 });
messageSchema.index({ userId: 1, createdAt: -1 });

export const Message: Model<IMessageDocument> = mongoose.models.Message ?? mongoose.model<IMessageDocument>("Message", messageSchema);