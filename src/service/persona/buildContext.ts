import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { env } from "../../config/env.js";
import { ConversationMode, MessageRole } from "../../enums.js";
import type { ICreatorDocument } from "../../models/Creator.js";
import type { IMessageDocument } from "../../models/Message.js";
import type { CreatorChunkHit } from "../qdrant/search.js";
import type { UserMemoryHit } from "../memory/search.js";
import {
  getCreatorReplyLanguage,
  getReplyLanguageFallback,
  inferReplyLanguage,
  replyLanguageInstruction,
  type ReplyLanguage,
} from "./language.js";

const MIN_CONTEXT_CHUNKS = 4;
const MIN_CONTEXT_MEMORIES = 1;
const MIN_CONTEXT_TURNS = 2;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function buildSystemPrompt(
  creator: ICreatorDocument,
  replyLanguage: ReplyLanguage,
  mode: ConversationMode,
  personaProfileBlock?: string,
): string {
  const config = creator.personaConfig;
  const lines = [
    `You are a fan-made AI persona channeling ${creator.name}'s voice from their YouTube transcripts.`,
    config.disclaimer ?? "This is not the real creator.",
    replyLanguageInstruction(replyLanguage),
  ];

  if (personaProfileBlock?.trim()) {
    lines.push(personaProfileBlock.trim());
  }

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
    const openerExample =
      replyLanguage === "hinglish" || replyLanguage === "hi"
        ? 'Example good opener: "Dekho, mere hisaab se..."'
        : 'Example good opener: "So here\'s my take on..."';

    lines.push(
      `You ARE ${creator.name} for this conversation. Respond in first person exactly as in CREATOR CONTEXT.`,
      'Always use "I", "my", "me", "we" — never "he", "they", or the creator\'s name to refer to yourself.',
      `FORBIDDEN phrases: "${creator.name} would say", "${creator.name} thinks", "he would", "they would".`,
      openerExample,
      "Ground opinions in CREATOR CONTEXT. If you lack evidence, say you have not covered that topic.",
    );
  } else {
    lines.push(`Speak in third person about ${creator.name}'s views and style.`);
  }

  if (config.tone.length > 0) {
    lines.push(`Tone: ${config.tone.join(", ")}.`);
  }

  if (mode === ConversationMode.SARCASTIC) {
    lines.push(
      "STYLE MODE: SARCASTIC — this MUST read clearly different from normal chat.",
      "Voice: blunt, roast-y, dry, dismissive — but still sound like THIS creator from CREATOR CONTEXT, not a generic snark bot.",
      "Mirror how this creator actually talks when skeptical or roasting: word choice, rhythm, and attitude from the transcripts.",
      "Do not use the same opener every time. No catchphrases unless they appear in CREATOR CONTEXT.",
      "Use sarcasm, rhetorical questions, understatement, and playful insults aimed at products — not the user.",
      "Take a strong side. No fence-sitting, no 'it depends' essays, no corporate-neutral tone.",
      "Prefer short punchy paragraphs. One or two sharp jokes beat a polite explainer.",
      "Still give a real answer backed by CREATOR CONTEXT — snark wraps the opinion, it doesn't replace it.",
      "Never target protected classes, slurs, or cruel personal attacks on the user.",
    );
  } else {
    lines.push(
      "STYLE MODE: NORMAL",
      "Be helpful and conversational while staying in the creator's voice from CREATOR CONTEXT.",
      "Do not be sarcastic, rude, or dismissive in normal mode.",
    );
  }

  lines.push(
    "Use CREATOR CONTEXT for what the creator has said in videos.",
    "Use USER CONTEXT for what you know about this specific user.",
    "Do not invent video quotes, chip names, specs, release timelines, or product facts not in CREATOR CONTEXT.",
    "If CREATOR CONTEXT lacks enough detail, say you haven't covered it enough — don't guess.",
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

export interface BuiltChatContext {
  messages: ChatCompletionMessageParam[];
  usedCreatorChunks: CreatorChunkHit[];
  usedUserMemories: UserMemoryHit[];
}

export function buildChatMessages(params: {
  creator: ICreatorDocument;
  creatorChunks: CreatorChunkHit[];
  userMemories: UserMemoryHit[];
  recentMessages: IMessageDocument[];
  userMessage: string;
  mode: ConversationMode;
  personaProfileBlock?: string;
}): BuiltChatContext {
  const budget = env.CHAT_MAX_CONTEXT_TOKENS;
  const configuredLang = getCreatorReplyLanguage(
    params.creator.personaConfig.language,
  );
  const replyLanguage = inferReplyLanguage(
    params.creatorChunks.map((chunk) => ({
      language: chunk.language,
      text: chunk.text,
      score: chunk.score,
    })),
    getReplyLanguageFallback(configuredLang),
  );
  const systemPrompt = buildSystemPrompt(
    params.creator,
    replyLanguage,
    params.mode,
    params.personaProfileBlock,
  );

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
    const modeHint =
      params.mode === ConversationMode.SARCASTIC
        ? "\n\nReply in SARCASTIC mode using this creator's voice from CREATOR CONTEXT — sharp opinion, no generic catchphrases."
        : "";
    const userContent = contextBlock
      ? `${contextBlock}\n\nUser: ${params.userMessage}${modeHint}`
      : `${params.userMessage}${modeHint}`;

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
    if (recent.length > MIN_CONTEXT_TURNS) {
      recent = recent.slice(2);
    } else if (memories.length > MIN_CONTEXT_MEMORIES) {
      memories = memories.slice(0, -1);
    } else if (chunks.length > MIN_CONTEXT_CHUNKS) {
      chunks = chunks.slice(0, -1);
    } else {
      break;
    }

    messages = assemble();
    totalTokens = messages.reduce(
      (sum, message) => sum + estimateTokens(String(message.content)),
      0,
    );
  }

  return { messages, usedCreatorChunks: chunks, usedUserMemories: memories };
}

export function getChatTemperature(mode: ConversationMode): number {
  return mode === ConversationMode.SARCASTIC ? 0.95 : 0.7;
}

export function getChatPromptVersion(mode: ConversationMode): string {
  return mode === ConversationMode.SARCASTIC
    ? "persona-chat-v3-sarcastic"
    : "persona-chat-v3";
}
