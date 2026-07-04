import { type Types } from "mongoose";
import {
  Message,
  type IMessage,
  type IMessageDocument,
} from "../models/Message.js";
import type { MessageRole } from "../enums.js";

export interface CreateMessageInput {
  conversationId: Types.ObjectId;
  creatorId: Types.ObjectId;
  userId?: Types.ObjectId | string;
  role: MessageRole;
  content: string;
  retrieval?: IMessage["retrieval"];
  generation?: IMessage["generation"];
  safety?: IMessage["safety"];
}

export class MessageRepository {
  async findRecentByConversation(
    conversationId: Types.ObjectId,
    limit: number,
  ): Promise<IMessageDocument[]> {
    const rows = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(limit);

    return rows.reverse();
  }

  async create(input: CreateMessageInput): Promise<IMessageDocument> {
    return Message.create(input);
  }
}

export const messageRepository = new MessageRepository();
