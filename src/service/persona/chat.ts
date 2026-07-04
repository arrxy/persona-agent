import { OpenAI } from "openai";
import { env } from "../../config/env.js";
import { ConversationMode, MessageRole } from "../../enums.js";
import { Conversation } from "../../models/Conversation.js";
import { Creator } from "../../models/Creator.js";
import { Message } from "../../models/Message.js";
import { AppError } from "../../utils/errors.js";
import { extractAndStoreMemories } from "../memory/extract.js";
import { searchUserMemories } from "../memory/search.js";
import { searchCreatorChunks } from "../qdrant/search.js";
import { getPersonaProfilePromptBlock } from "../ingestion/personaProfile.js";
import { buildChatMessages, getChatPromptVersion, getChatTemperature } from "./buildContext.js";

const openai = new OpenAI({ apiKey: env.OPEN_AI_KEY });

function requireOpenAiKey(): void {
  if (!env.OPEN_AI_KEY) {
    throw new AppError(503, "Chat is unavailable: OPEN_AI_KEY not configured");
  }
}

export interface ChatInput {
  userId: string;
  creatorId: string;
  conversationId?: string;
  message: string;
  mode?: ConversationMode;
}

export interface ChatSource {
  type: "transcript" | "memory";
  text: string;
  videoTitle?: string;
  videoUrl?: string;
  score: number;
}

export interface ChatResult {
  conversationId: string;
  reply: string;
  sources: ChatSource[];
  mode: ConversationMode;
}

function resolveChatMode(mode?: ConversationMode): ConversationMode {
  return mode === ConversationMode.SARCASTIC
    ? ConversationMode.SARCASTIC
    : ConversationMode.CHAT;
}

async function getOrCreateConversation(params: {
  userId: string;
  creatorId: string;
  conversationId?: string;
  message: string;
  mode: ConversationMode;
}) {
  if (params.conversationId) {
    const conversation = await Conversation.findOne({
      _id: params.conversationId,
      userId: params.userId,
      creatorId: params.creatorId,
      deletedAt: null,
    });

    if (!conversation) {
      throw new AppError(404, "Conversation not found");
    }

    if (conversation.mode !== params.mode) {
      conversation.mode = params.mode;
      await conversation.save();
    }

    return conversation;
  }

  return Conversation.create({
    userId: params.userId,
    creatorId: params.creatorId,
    mode: params.mode,
    title: params.message.slice(0, 80),
  });
}

export async function chatWithPersona(input: ChatInput): Promise<ChatResult> {
  requireOpenAiKey();

  const creator = await Creator.findById(input.creatorId);
  if (!creator) {
    throw new AppError(404, "Creator not found");
  }

  const chatMode = resolveChatMode(input.mode);

  const conversation = await getOrCreateConversation({
    userId: input.userId,
    creatorId: input.creatorId,
    conversationId: input.conversationId,
    message: input.message,
    mode: chatMode,
  });

  const conversationId = conversation._id.toString();
  const temperature = getChatTemperature(chatMode);
  const promptVersion = getChatPromptVersion(chatMode);

  const [creatorChunks, userMemories, recentMessages, personaProfileBlock] =
    await Promise.all([
      searchCreatorChunks({
        creatorId: input.creatorId,
        query: input.message,
        topK: env.CREATOR_RAG_TOP_K,
      }),
      searchUserMemories({
        userId: input.userId,
        creatorId: input.creatorId,
        query: input.message,
        topK: env.USER_MEMORY_TOP_K,
      }),
      Message.find({ conversationId: conversation._id })
        .sort({ createdAt: -1 })
        .limit(env.CHAT_SESSION_TURNS * 2)
        .then((rows) => rows.reverse()),
      getPersonaProfilePromptBlock(input.creatorId),
    ]);

  const { messages, usedCreatorChunks, usedUserMemories } = buildChatMessages({
    creator,
    creatorChunks,
    userMemories,
    recentMessages,
    userMessage: input.message,
    mode: chatMode,
    personaProfileBlock,
  });

  const completion = await openai.chat.completions.create({
    model: env.CHAT_MODEL,
    temperature,
    messages,
  });

  const reply = completion.choices[0]?.message?.content?.trim();
  if (!reply) {
    throw new AppError(502, "Model returned an empty response");
  }

  const userMessageDoc = await Message.create({
    conversationId: conversation._id,
    creatorId: creator._id,
    userId: input.userId,
    role: MessageRole.USER,
    content: input.message,
  });

  const assistantMessageDoc = await Message.create({
    conversationId: conversation._id,
    creatorId: creator._id,
    userId: input.userId,
    role: MessageRole.ASSISTANT,
    content: reply,
    retrieval: {
      query: input.message,
      retrievedChunkIds: usedCreatorChunks.map((chunk) => chunk.chunkId),
      retrievedFactIds: usedUserMemories.map((memory) => memory.memoryId),
      modelUsed: env.CHAT_MODEL,
    },
    generation: {
      model: env.CHAT_MODEL,
      temperature,
      promptVersion,
    },
    safety: {
      usedDisclaimer: creator.personaConfig.identityPolicy.mustDiscloseFanMade,
    },
  });

  void extractAndStoreMemories({
    userId: input.userId,
    creatorId: input.creatorId,
    conversationId,
    userMessage: input.message,
    assistantMessage: reply,
    sourceMessageIds: [userMessageDoc._id, assistantMessageDoc._id],
  });

  const sources: ChatSource[] = [
    ...usedCreatorChunks.map((chunk) => ({
      type: "transcript" as const,
      text: chunk.text,
      videoTitle: chunk.videoTitle,
      videoUrl: chunk.videoUrl,
      score: chunk.score,
    })),
    ...usedUserMemories.map((memory) => ({
      type: "memory" as const,
      text: memory.text,
      score: memory.score,
    })),
  ];

  return {
    conversationId,
    reply,
    sources,
    mode: chatMode,
  };
}
