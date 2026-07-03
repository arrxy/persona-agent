import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { qdrantFetch } from "./client.js";

export interface QdrantChunkPayload {
  creatorId: string;
  videoId: string;
  youtubeVideoId: string;
  chunkIndex: number;
  text: string;
  startSeconds: number;
  endSeconds: number;
  videoTitle: string;
  videoUrl: string;
  publishedAt?: string;
  language: string;
}

export interface QdrantChunkPoint {
  pointId: string;
  vector: number[];
  payload: QdrantChunkPayload;
}

export function getCreatorCollectionName(creatorId: string): string {
  return `creator_${creatorId}`;
}

export async function ensureCreatorCollection(creatorId: string): Promise<string> {
  const collectionName = getCreatorCollectionName(creatorId);
  const data = await qdrantFetch<{
    result: { collections: { name: string }[] };
  }>("/collections");

  const exists = data.result.collections.some(
    (collection) => collection.name === collectionName,
  );

  if (!exists) {
    await qdrantFetch(`/collections/${collectionName}`, {
      method: "PUT",
      body: JSON.stringify({
        vectors: {
          size: env.EMBEDDING_DIMENSIONS,
          distance: "Cosine",
        },
      }),
    });
  }

  return collectionName;
}

export async function upsertChunkPoints(
  creatorId: string,
  points: QdrantChunkPoint[],
): Promise<string> {
  const collectionName = await ensureCreatorCollection(creatorId);

  if (points.length === 0) {
    return collectionName;
  }

  await qdrantFetch(`/collections/${collectionName}/points?wait=true`, {
    method: "PUT",
    body: JSON.stringify({
      points: points.map((point) => ({
        id: point.pointId,
        vector: point.vector,
        payload: point.payload,
      })),
    }),
  });

  return collectionName;
}

export function createPointId(): string {
  return randomUUID();
}
