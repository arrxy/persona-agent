import { Types } from "mongoose";
import { OpenAI } from "openai";
import { env } from "../../config/env.js";
import { userMemoryRepository } from "../../repository/UserMemoryRepository.js";
import { embedTexts } from "../embedding.js";
import { deletePoints } from "../qdrant/client.js";
import { searchPoints } from "../qdrant/client.js";
import {
  scopeFilter,
  upsertUserMemoryPoint,
  USER_MEMORY_COLLECTION,
  type UserMemoryPayload,
} from "../qdrant/userMemory.js";
import { UserMemoryCategory } from "../../enums.js";

const openai = new OpenAI({ apiKey: env.OPEN_AI_KEY });

function requireOpenAiKey(): void {
  if (!env.OPEN_AI_KEY) {
    throw new Error("Missing required environment variable: OPEN_AI_KEY");
  }
}

interface ExtractedFact {
  text: string;
  category?: UserMemoryCategory;
}

async function extractFacts(params: {
  userMessage: string;
  assistantMessage: string;
}): Promise<ExtractedFact[]> {
  requireOpenAiKey();

  const response = await openai.chat.completions.create({
    model: env.CHAT_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extract durable facts about the USER from this chat exchange.
Return JSON: { "facts": [{ "text": string, "category": "preference"|"context"|"plan"|"relationship" }] }
Rules:
- Only facts about the user (preferences, devices they own, plans, constraints)
- Skip generic chitchat, greetings, and creator opinions
- Each fact is one short sentence in third person ("User owns a Pixel 8")
- Return { "facts": [] } if nothing worth remembering`,
      },
      {
        role: "user",
        content: `User: ${params.userMessage}\nAssistant: ${params.assistantMessage}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as {
      facts?: { text?: string; category?: string }[];
    };
    return (parsed.facts ?? [])
      .filter((fact) => typeof fact.text === "string" && fact.text.trim())
      .map((fact) => ({
        text: fact.text!.trim(),
        category: Object.values(UserMemoryCategory).includes(
          fact.category as UserMemoryCategory,
        )
          ? (fact.category as UserMemoryCategory)
          : UserMemoryCategory.CONTEXT,
      }));
  } catch {
    return [];
  }
}

async function isDuplicate(params: {
  userId: string;
  creatorId: string;
  vector: number[];
}): Promise<boolean> {
  try {
    const results = await searchPoints<UserMemoryPayload>({
      collectionName: USER_MEMORY_COLLECTION,
      vector: params.vector,
      limit: 1,
      filter: scopeFilter(params.userId, params.creatorId),
    });

    return (results[0]?.score ?? 0) >= env.MEMORY_DEDUP_THRESHOLD;
  } catch {
    return false;
  }
}

async function enforceMemoryCap(params: {
  userId: string;
  creatorId: string;
}): Promise<void> {
  const count = await userMemoryRepository.countByUserAndCreator(
    params.userId,
    params.creatorId,
  );

  const overflow = count - env.USER_MEMORY_MAX_PER_SCOPE + 1;
  if (overflow <= 0) return;

  const oldest = await userMemoryRepository.findOldest(
    params.userId,
    params.creatorId,
    overflow,
  );

  const pointIds = oldest.map((memory) => memory.qdrant.pointId);
  await deletePoints(USER_MEMORY_COLLECTION, pointIds);
  await userMemoryRepository.deleteByIds(oldest.map((m) => m._id));
}

async function storeFact(params: {
  userId: string;
  creatorId: string;
  conversationId: string;
  text: string;
  category?: UserMemoryCategory;
  sourceMessageIds: Types.ObjectId[];
}): Promise<void> {
  const [vector] = await embedTexts([params.text]);
  if (!vector) return;

  if (
    await isDuplicate({
      userId: params.userId,
      creatorId: params.creatorId,
      vector,
    })
  ) {
    return;
  }

  await enforceMemoryCap({
    userId: params.userId,
    creatorId: params.creatorId,
  });

  const memory = await userMemoryRepository.create({
    userId: params.userId,
    creatorId: params.creatorId,
    conversationId: params.conversationId,
    text: params.text,
    category: params.category,
    sourceMessageIds: params.sourceMessageIds,
    qdrant: {
      collectionName: USER_MEMORY_COLLECTION,
      pointId: "pending",
      vectorModel: env.EMBEDDING_MODEL,
    },
  });

  const pointId = await upsertUserMemoryPoint({
    userId: params.userId,
    creatorId: params.creatorId,
    memoryId: memory._id.toString(),
    text: params.text,
    category: params.category,
    vector,
  });

  memory.qdrant.pointId = pointId;
  memory.qdrant.indexedAt = new Date();
  await userMemoryRepository.save(memory);
}

export async function extractAndStoreMemories(params: {
  userId: string;
  creatorId: string;
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
  sourceMessageIds: Types.ObjectId[];
}): Promise<void> {
  try {
    const facts = await extractFacts({
      userMessage: params.userMessage,
      assistantMessage: params.assistantMessage,
    });

    for (const fact of facts) {
      await storeFact({
        userId: params.userId,
        creatorId: params.creatorId,
        conversationId: params.conversationId,
        text: fact.text,
        category: fact.category,
        sourceMessageIds: params.sourceMessageIds,
      });
    }
  } catch (error) {
    console.error("Memory extraction failed:", error);
  }
}
