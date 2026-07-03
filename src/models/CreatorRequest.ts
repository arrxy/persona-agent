import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";
import { CreatorRequestStatus } from "../enums.js";

export interface ICreatorRequest {
  userId: Types.ObjectId;

  inputChannelUrl: string;
  normalizedChannelId?: string;

  creatorId?: Types.ObjectId;

  status: CreatorRequestStatus;

  message?: string;

  error?: {
    code?: string;
    message: string;
  };

  processing: {
    pickedAt?: Date;
    completedAt?: Date;
    workerId?: string;
    attempts: number;
    nextRetryAt?: Date;
  };
}

export interface ICreatorRequestDocument extends ICreatorRequest, Document {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

const creatorRequestSchema = new Schema<ICreatorRequestDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    inputChannelUrl: {
      type: String,
      required: true,
      trim: true,
    },

    normalizedChannelId: {
      type: String,
      trim: true,
      index: true,
    },

    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "Creator",
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(CreatorRequestStatus),
      default: CreatorRequestStatus.PENDING,
      required: true,
      index: true,
    },

    message: String,

    error: {
      code: String,
      message: String,
    },

    processing: {
      pickedAt: Date,
      completedAt: Date,
      workerId: String,

      attempts: {
        type: Number,
        default: 0,
      },

      nextRetryAt: Date,
    },
  },
  { timestamps: true },
);

creatorRequestSchema.index({ status: 1, createdAt: 1 });
creatorRequestSchema.index({ userId: 1, createdAt: -1 });
creatorRequestSchema.index({ normalizedChannelId: 1, status: 1 });

export const CreatorRequest: Model<ICreatorRequestDocument> =
  mongoose.models.CreatorRequest ??
  mongoose.model<ICreatorRequestDocument>(
    "CreatorRequest",
    creatorRequestSchema,
  );
