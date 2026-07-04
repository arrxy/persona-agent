import { type Types } from "mongoose";
import {
  UserMemory,
  type IUserMemory,
  type IUserMemoryDocument,
} from "../models/UserMemory.js";

export interface CreateUserMemoryInput {
  userId: Types.ObjectId | string;
  creatorId: Types.ObjectId | string;
  conversationId: Types.ObjectId | string;
  text: string;
  category?: IUserMemory["category"];
  sourceMessageIds: Types.ObjectId[];
  qdrant: IUserMemory["qdrant"];
}

export class UserMemoryRepository {
  async findById(
    memoryId: Types.ObjectId | string,
  ): Promise<IUserMemoryDocument | null> {
    return UserMemory.findById(memoryId);
  }

  async countByUserAndCreator(
    userId: Types.ObjectId | string,
    creatorId: Types.ObjectId | string,
  ): Promise<number> {
    return UserMemory.countDocuments({ userId, creatorId });
  }

  async findOldest(
    userId: Types.ObjectId | string,
    creatorId: Types.ObjectId | string,
    limit: number,
  ): Promise<IUserMemoryDocument[]> {
    return UserMemory.find({ userId, creatorId })
      .sort({ createdAt: 1 })
      .limit(limit);
  }

  async deleteByIds(ids: Types.ObjectId[]): Promise<void> {
    if (ids.length === 0) return;
    await UserMemory.deleteMany({ _id: { $in: ids } });
  }

  async create(input: CreateUserMemoryInput): Promise<IUserMemoryDocument> {
    return UserMemory.create(input);
  }

  async save(memory: IUserMemoryDocument): Promise<IUserMemoryDocument> {
    return memory.save();
  }
}

export const userMemoryRepository = new UserMemoryRepository();
