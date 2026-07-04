import { env } from "../../config/env.js";
import { Types } from "mongoose";
import { TranscriptChunk } from "../../models/TranscriptChunk.js";
import { embedTexts } from "../embedding.js";
import type { QdrantChunkPayload } from "./collections.js";
import { getCreatorCollectionName } from "./collections.js";
import { searchPoints } from "./client.js";

export interface CreatorChunkHit {
  chunkId: Types.ObjectId;
  score: number;
  text: string;
  language: string;
  videoTitle: string;
  videoUrl: string;
  youtubeVideoId: string;
  startSeconds: number;
  endSeconds: number;
}

export async function searchCreatorChunks(params: {
  creatorId: string;
  query: string;
  topK?: number;
}): Promise<CreatorChunkHit[]> {
  const topK = params.topK ?? env.CREATOR_RAG_TOP_K;
  const collectionName = getCreatorCollectionName(params.creatorId);
  const [queryVector] = await embedTexts([params.query]);

  if (!queryVector) return [];

  let results;
  try {
    results = await searchPoints<QdrantChunkPayload>({
      collectionName,
      vector: queryVector,
      limit: topK,
    });
  } catch {
    return [];
  }

  const hits: CreatorChunkHit[] = [];

  for (const result of results) {
    const payload = result.payload;
    if (!payload?.text) continue;

    const chunk = await TranscriptChunk.findOne({
      creatorId: params.creatorId,
      youtubeVideoId: payload.youtubeVideoId,
      chunkIndex: payload.chunkIndex,
    });

    if (!chunk) continue;

    hits.push({
      chunkId: chunk._id,
      score: result.score,
      text: payload.text,
      language: payload.language ?? chunk.metadata?.language ?? "en",
      videoTitle: payload.videoTitle,
      videoUrl: payload.videoUrl,
      youtubeVideoId: payload.youtubeVideoId,
      startSeconds: payload.startSeconds,
      endSeconds: payload.endSeconds,
    });
  }

  const minScore = env.CREATOR_RAG_MIN_SCORE;
  const filtered = hits.filter((hit) => hit.score >= minScore);

  if (filtered.length >= 2) {
    return filtered;
  }

  return hits;
}
