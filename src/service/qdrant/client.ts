import { env } from "../../config/env.js";

export interface QdrantSearchResult<TPayload = Record<string, unknown>> {
  id: string | number;
  score: number;
  payload?: TPayload;
}

function getBaseUrl(): string {
  return env.QDRANT_URL.replace(/\/$/, "");
}

export async function qdrantFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Qdrant API error (${response.status}): ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function ensureCollection(collectionName: string): Promise<void> {
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
}

export async function searchPoints<TPayload = Record<string, unknown>>(params: {
  collectionName: string;
  vector: number[];
  limit: number;
  filter?: Record<string, unknown>;
}): Promise<QdrantSearchResult<TPayload>[]> {
  const body: Record<string, unknown> = {
    vector: params.vector,
    limit: params.limit,
    with_payload: true,
  };

  if (params.filter) {
    body.filter = params.filter;
  }

  const data = await qdrantFetch<{
    result: QdrantSearchResult<TPayload>[];
  }>(`/collections/${params.collectionName}/points/search`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  return data.result;
}

export async function deletePoints(
  collectionName: string,
  pointIds: string[],
): Promise<void> {
  if (pointIds.length === 0) return;

  await qdrantFetch(`/collections/${collectionName}/points/delete?wait=true`, {
    method: "POST",
    body: JSON.stringify({ points: pointIds }),
  });
}
