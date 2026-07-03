import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { ensureCollection, qdrantFetch } from "./client.js";

export const USER_MEMORY_COLLECTION = "user_memory";

export interface UserMemoryPayload {
  userId: string;
  creatorId: string;
  memoryId: string;
  text: string;
  category?: string;
  createdAt: string;
}

export async function ensureUserMemoryCollection(): Promise<void> {
  await ensureCollection(USER_MEMORY_COLLECTION);
}

export async function upsertUserMemoryPoint(params: {
  userId: string;
  creatorId: string;
  memoryId: string;
  text: string;
  category?: string;
  vector: number[];
}): Promise<string> {
  await ensureUserMemoryCollection();

  const pointId = randomUUID();

  await qdrantFetch(
    `/collections/${USER_MEMORY_COLLECTION}/points?wait=true`,
    {
      method: "PUT",
      body: JSON.stringify({
        points: [
          {
            id: pointId,
            vector: params.vector,
            payload: {
              userId: params.userId,
              creatorId: params.creatorId,
              memoryId: params.memoryId,
              text: params.text,
              category: params.category,
              createdAt: new Date().toISOString(),
            } satisfies UserMemoryPayload,
          },
        ],
      }),
    },
  );

  return pointId;
}

export function scopeFilter(userId: string, creatorId: string) {
  return {
    must: [
      { key: "userId", match: { value: userId } },
      { key: "creatorId", match: { value: creatorId } },
    ],
  };
}
