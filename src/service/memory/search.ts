import { Types } from "mongoose";
import { env } from "../../config/env.js";
import { userMemoryRepository } from "../../repository/UserMemoryRepository.js";
import { embedTexts } from "../embedding.js";
import {
  scopeFilter,
  USER_MEMORY_COLLECTION,
  type UserMemoryPayload,
} from "../qdrant/userMemory.js";
import { searchPoints } from "../qdrant/client.js";

export interface UserMemoryHit {
  memoryId: Types.ObjectId;
  text: string;
  score: number;
  category?: string;
}

export async function searchUserMemories(params: {
  userId: string;
  creatorId: string;
  query: string;
  topK?: number;
}): Promise<UserMemoryHit[]> {
  const topK = params.topK ?? env.USER_MEMORY_TOP_K;
  const [queryVector] = await embedTexts([params.query]);

  if (!queryVector) return [];

  let results;
  try {
    results = await searchPoints<UserMemoryPayload>({
      collectionName: USER_MEMORY_COLLECTION,
      vector: queryVector,
      limit: topK,
      filter: scopeFilter(params.userId, params.creatorId),
    });
  } catch {
    return [];
  }

  const hits: UserMemoryHit[] = [];

  for (const result of results) {
    const payload = result.payload;
    if (!payload?.memoryId || !payload.text) continue;

    const memory = await userMemoryRepository.findById(payload.memoryId);
    if (!memory) continue;

    hits.push({
      memoryId: memory._id,
      text: payload.text,
      score: result.score,
      category: payload.category,
    });
  }

  return hits;
}
