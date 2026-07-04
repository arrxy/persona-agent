import { type Types } from "mongoose";
import {
  Conversation,
  type IConversation,
  type IConversationDocument,
} from "../models/Conversation.js";

export interface CreateConversationInput {
  userId: string;
  creatorId: string;
  mode: IConversation["mode"];
  title: string;
}

export class ConversationRepository {
  async findActiveForUser(params: {
    conversationId: Types.ObjectId | string;
    userId: string;
    creatorId: string;
  }): Promise<IConversationDocument | null> {
    return Conversation.findOne({
      _id: params.conversationId,
      userId: params.userId,
      creatorId: params.creatorId,
      deletedAt: null,
    });
  }

  async create(
    input: CreateConversationInput,
  ): Promise<IConversationDocument> {
    return Conversation.create(input);
  }

  async save(
    conversation: IConversationDocument,
  ): Promise<IConversationDocument> {
    return conversation.save();
  }
}

export const conversationRepository = new ConversationRepository();
