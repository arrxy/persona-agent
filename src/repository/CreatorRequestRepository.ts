import { type Types } from "mongoose";
import {
  CreatorRequest,
  type ICreatorRequestDocument,
} from "../models/CreatorRequest.js";
import { CreatorRequestStatus } from "../enums.js";

export interface CreateCreatorRequestInput {
  userId: Types.ObjectId | string;
  inputChannelUrl: string;
  creatorId?: Types.ObjectId | string;
  reingest?: boolean;
}

export interface ClaimCreatorRequestInput {
  requestId: Types.ObjectId | string;
  workerId: string;
}

export interface MarkCreatorRequestCompletedInput {
  requestId: Types.ObjectId | string;
  creatorId?: Types.ObjectId | string;
  normalizedChannelId?: string;
  message?: string;
}

export interface MarkCreatorRequestFailedInput {
  requestId: Types.ObjectId | string;
  code?: string;
  message: string;
  nextRetryAt?: Date;
}

export class CreatorRequestRepository {
  async create(
    input: CreateCreatorRequestInput,
  ): Promise<ICreatorRequestDocument> {
    return CreatorRequest.create({
      userId: input.userId,
      inputChannelUrl: input.inputChannelUrl,
      ...(input.creatorId ? { creatorId: input.creatorId } : {}),
      ...(input.reingest ? { reingest: true } : {}),
      status: CreatorRequestStatus.PENDING,
      processing: {
        attempts: 0,
      },
    });
  }


  async findByUserIdAndInputChannelUrl(
    userId: Types.ObjectId | string,
    inputChannelUrl: string,
    status: CreatorRequestStatus,
  ): Promise<ICreatorRequestDocument | null> {
    return CreatorRequest.findOne({ userId, inputChannelUrl, status });
  }

  async findById(
    requestId: Types.ObjectId | string,
  ): Promise<ICreatorRequestDocument | null> {
    return CreatorRequest.findById(requestId);
  }

  async findByUserId(
    userId: Types.ObjectId | string,
    limit = 20,
  ): Promise<ICreatorRequestDocument[]> {
    return CreatorRequest.find({ userId }).sort({ createdAt: -1 }).limit(limit);
  }

  async findExistingActiveRequest(params: {
    userId: Types.ObjectId | string;
    inputChannelUrl: string;
  }): Promise<ICreatorRequestDocument | null> {
    return CreatorRequest.findOne({
      userId: params.userId,
      inputChannelUrl: params.inputChannelUrl,
    });
  }

  async findByCreatorId(
    creatorId: Types.ObjectId | string,
    limit = 20,
  ): Promise<ICreatorRequestDocument[]> {
    return CreatorRequest.find({ creatorId })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async findPending(limit = 10): Promise<ICreatorRequestDocument[]> {
    const now = new Date();

    return CreatorRequest.find({
      status: CreatorRequestStatus.PENDING,
      $or: [
        { "processing.nextRetryAt": { $exists: false } },
        { "processing.nextRetryAt": null },
        { "processing.nextRetryAt": { $lte: now } },
      ],
    })
      .sort({ createdAt: 1 })
      .limit(limit);
  }

  async claimPendingRequest(
    input: ClaimCreatorRequestInput,
  ): Promise<ICreatorRequestDocument | null> {
    return CreatorRequest.findOneAndUpdate(
      {
        _id: input.requestId,
        status: CreatorRequestStatus.PENDING,
        $or: [
          { "processing.nextRetryAt": { $exists: false } },
          { "processing.nextRetryAt": null },
          { "processing.nextRetryAt": { $lte: new Date() } },
        ],
      },
      {
        $set: {
          status: CreatorRequestStatus.PROCESSING,
          "processing.pickedAt": new Date(),
          "processing.workerId": input.workerId,
        },
        $inc: {
          "processing.attempts": 1,
        },
      },
      { returnDocument: "after" },
    );
  }

  async claimNextPendingRequest(
    workerId: string,
  ): Promise<ICreatorRequestDocument | null> {
    const now = new Date();

    return CreatorRequest.findOneAndUpdate(
      {
        status: CreatorRequestStatus.PENDING,
        $or: [
          { "processing.nextRetryAt": { $exists: false } },
          { "processing.nextRetryAt": null },
          { "processing.nextRetryAt": { $lte: now } },
        ],
      },
      {
        $set: {
          status: CreatorRequestStatus.PROCESSING,
          "processing.pickedAt": now,
          "processing.workerId": workerId,
        },
        $inc: {
          "processing.attempts": 1,
        },
      },
      {
        returnDocument: "after",
        sort: { createdAt: 1 },
      },
    );
  }

  async attachCreator(params: {
    requestId: Types.ObjectId | string;
    creatorId: Types.ObjectId | string;
    normalizedChannelId: string;
  }): Promise<ICreatorRequestDocument | null> {
    return CreatorRequest.findByIdAndUpdate(
      params.requestId,
      {
        $set: {
          creatorId: params.creatorId,
          normalizedChannelId: params.normalizedChannelId,
        },
      },
      { returnDocument: "after" },
    );
  }

  async markCompleted(
    input: MarkCreatorRequestCompletedInput,
  ): Promise<ICreatorRequestDocument | null> {
    const update = {
      $set: {
        status: CreatorRequestStatus.COMPLETED,
        message: input.message,
        "processing.completedAt": new Date(),
        ...(input.creatorId ? { creatorId: input.creatorId } : {}),
        ...(input.normalizedChannelId
          ? { normalizedChannelId: input.normalizedChannelId }
          : {}),
      },
      $unset: {
        error: "",
        "processing.nextRetryAt": "",
      },
    };

    return CreatorRequest.findByIdAndUpdate(input.requestId, update, {
      returnDocument: "after",
    });
  }

  async markFailed(
    input: MarkCreatorRequestFailedInput,
  ): Promise<ICreatorRequestDocument | null> {
    const update = {
      $set: {
        status: CreatorRequestStatus.FAILED,
        error: {
          code: input.code,
          message: input.message,
        },
        ...(input.nextRetryAt
          ? { "processing.nextRetryAt": input.nextRetryAt }
          : {}),
      },
    };

    return CreatorRequest.findByIdAndUpdate(input.requestId, update, {
      returnDocument: "after",
    });
  }

  async scheduleRetry(params: {
    requestId: Types.ObjectId | string;
    code: string;
    message: string;
    nextRetryAt: Date;
  }): Promise<void> {
    await CreatorRequest.findByIdAndUpdate(params.requestId, {
      $set: {
        status: CreatorRequestStatus.PENDING,
        error: { code: params.code, message: params.message },
        "processing.nextRetryAt": params.nextRetryAt,
      },
    });
  }

  async retryFailedRequest(
    requestId: Types.ObjectId | string,
  ): Promise<ICreatorRequestDocument | null> {
    return CreatorRequest.findOneAndUpdate(
      {
        _id: requestId,
        status: CreatorRequestStatus.FAILED,
      },
      {
        $set: {
          status: CreatorRequestStatus.PENDING,
        },
        $unset: {
          error: "",
          "processing.nextRetryAt": "",
        },
      },
      { returnDocument: "after" },
    );
  }

  async cancel(
    requestId: Types.ObjectId | string,
  ): Promise<ICreatorRequestDocument | null> {
    return CreatorRequest.findOneAndUpdate(
      {
        _id: requestId,
        status: {
          $in: [CreatorRequestStatus.PENDING, CreatorRequestStatus.PROCESSING],
        },
      },
      {
        $set: {
          status: "cancelled",
          "processing.completedAt": new Date(),
        },
      },
      { returnDocument: "after" },
    );
  }

  async updateStatus(params: {
    requestId: Types.ObjectId | string;
    status: CreatorRequestStatus;
    message?: string;
  }): Promise<ICreatorRequestDocument | null> {
    return CreatorRequest.findByIdAndUpdate(
      params.requestId,
      {
        $set: {
          status: params.status,
          ...(params.message !== undefined ? { message: params.message } : {}),
        },
      },
      { returnDocument: "after" },
    );
  }

  async reopenForProcessing(
    requestId: Types.ObjectId | string,
  ): Promise<ICreatorRequestDocument | null> {
    return CreatorRequest.findByIdAndUpdate(
      requestId,
      {
        $set: { status: CreatorRequestStatus.PENDING },
        $unset: {
          message: "",
          error: "",
          "processing.completedAt": "",
          "processing.nextRetryAt": "",
        },
      },
      { returnDocument: "after" },
    );
  }

  async countByStatus(status: CreatorRequestStatus): Promise<number> {
    return CreatorRequest.countDocuments({ status });
  }

  async findMany(
    filter: Record<string, unknown>,
    limit = 20,
  ): Promise<ICreatorRequestDocument[]> {
    return CreatorRequest.find(filter).sort({ createdAt: -1 }).limit(limit);
  }
}

export const creatorRequestRepository = new CreatorRequestRepository();
