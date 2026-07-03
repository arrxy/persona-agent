import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { env } from "../../config/env.js";
import { MessageRole } from "../../enums.js";
import type { ICreatorDocument } from "../../models/Creator.js";
import type { IMessageDocument } from "../../models/Message.js";
import type { CreatorChunkHit } from "../qdrant/search.js";
import type { UserMemoryHit } from "../memory/search.js";
import {
  getCreatorReplyLanguage,
  replyLanguageInstruction,
  type ReplyLanguage,
} from "./language.js";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function buildSystemPrompt(
  creator: ICreatorDocument,
  replyLanguage: ReplyLanguage,
): string {
  const config = creator.personaConfig;
  const lines = [
    `You are a fan-made AI persona channeling ${creator.name}'s voice from their YouTube transcripts.`,
    config.disclaimer ?? "This is not the real creator.",
    replyLanguageInstruction(replyLanguage),
  ];

  if (config.identityPolicy.mustDiscloseFanMade) {
    lines.push(
      "If asked whether you are the real person, clarify you are an AI inspired by their public content.",
    );
  }

  if (!config.identityPolicy.canClaimToBeCreator) {
    lines.push("Never insist you are literally the real human creator.");
  }

  // Persona chat always uses first person; stored false was a legacy default.
  const useFirstPerson = true;

  if (useFirstPerson) {
    lines.push(
      `You ARE ${creator.name} for this conversation. Respond in first person exactly as in CREATOR CONTEXT.`,
      'Always use "I", "my", "me", "we" — never "he", "they", or the creator\'s name to refer to yourself.',
      `FORBIDDEN phrases: "${creator.name} would say", "${creator.name} thinks", "he would", "they would".`,
      'Example good opener: "So comparing your Pixel 8 to the iPhone 16, I think..."',
      "Ground opinions in CREATOR CONTEXT. If you lack evidence, say you have not covered that topic.",
    );
  } else {
    lines.push(`Speak in third person about ${creator.name}'s views and style.`);
  }

  if (config.tone.length > 0) {
    lines.push(`Tone: ${config.tone.join(", ")}.`);
  }

  lines.push(
    "Use CREATOR CONTEXT for what the creator has said in videos.",
    "Use USER CONTEXT for what you know about this specific user.",
    "Do not invent video quotes or specs not supported by context.",
  );

  return lines.join("\n");
}

function formatCreatorContext(chunks: CreatorChunkHit[]): string {
  if (chunks.length === 0) return "";

  const lines = chunks.map(
    (chunk) =>
      `- [${chunk.videoTitle}] ${chunk.text} (${chunk.videoUrl})`,
  );

  return `CREATOR CONTEXT (from videos):\n${lines.join("\n")}`;
}

function formatUserContext(memories: UserMemoryHit[]): string {
  if (memories.length === 0) return "";

  const lines = memories.map((memory) => `- ${memory.text}`);
  return `USER CONTEXT (remembered from past chats):\n${lines.join("\n")}`;
}

function formatRecentTurns(messages: IMessageDocument[]): string {
  if (messages.length === 0) return "";

  const lines = messages.map((message) => {
    const label = message.role === MessageRole.USER ? "User" : "Assistant";
    return `${label}: ${message.content}`;
  });

  return `RECENT CONVERSATION:\n${lines.join("\n\n")}`;
}

export function buildChatMessages(params: {
  creator: ICreatorDocument;
  creatorChunks: CreatorChunkHit[];
  userMemories: UserMemoryHit[];
  recentMessages: IMessageDocument[];
  userMessage: string;
}): ChatCompletionMessageParam[] {
  const budget = env.CHAT_MAX_CONTEXT_TOKENS;
  const replyLanguage = getCreatorReplyLanguage(
    params.creator.personaConfig.language,
  );
  const systemPrompt = buildSystemPrompt(params.creator, replyLanguage);

  let chunks = [...params.creatorChunks];
  let memories = [...params.userMemories];
  let recent = [...params.recentMessages];

  const assemble = () => {
    const contextParts = [
      formatCreatorContext(chunks),
      formatUserContext(memories),
      formatRecentTurns(recent),
    ].filter(Boolean);

    const contextBlock = contextParts.join("\n\n");
    const userContent = contextBlock
      ? `${contextBlock}\n\nUser: ${params.userMessage}`
      : params.userMessage;

    return [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userContent },
    ];
  };

  let messages = assemble();
  let totalTokens = messages.reduce(
    (sum, message) => sum + estimateTokens(String(message.content)),
    0,
  );

  while (totalTokens > budget) {
    if (recent.length > 2) {
      recent = recent.slice(2);
    } else if (chunks.length > 2) {
      chunks = chunks.slice(0, -1);
    } else if (memories.length > 1) {
      memories = memories.slice(0, -1);
    } else {
      break;
    }

    messages = assemble();
    totalTokens = messages.reduce(
      (sum, message) => sum + estimateTokens(String(message.content)),
      0,
    );
  }

  return messages;
}
