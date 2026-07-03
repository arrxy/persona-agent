import "@dotenvx/dotenvx/config";
import os from "node:os";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  PORT: Number(process.env.PORT) || 3000,
  OPEN_AI_KEY: process.env.OPEN_AI_KEY,
  MONGODB_URI: required("MONGODB_URI"),
  REDIS_URL: required("REDIS_URL"),
  JWT_SECRET: required("JWT_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  GOOGLE_CLIENT_ID: required("GOOGLE_CLIENT_ID"),
  ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY ?? "15m",
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY ?? "7d",
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
  WORKER_ID: process.env.WORKER_ID ?? os.hostname(),
  WORKER_POLL_INTERVAL_MS:
    Number(process.env.WORKER_POLL_INTERVAL_MS) || 30_000,
  QDRANT_URL: process.env.QDRANT_URL ?? "http://localhost:6333",
  QDRANT_API_KEY: process.env.QDRANT_API_KEY,
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  EMBEDDING_DIMENSIONS: Number(process.env.EMBEDDING_DIMENSIONS) || 1536,
  CHUNK_TARGET_WORDS: Number(process.env.CHUNK_TARGET_WORDS) || 400,
  CHAT_MODEL: process.env.CHAT_MODEL ?? "gpt-4o-mini",
  CHAT_MAX_CONTEXT_TOKENS: Number(process.env.CHAT_MAX_CONTEXT_TOKENS) || 4000,
  CHAT_SESSION_TURNS: Number(process.env.CHAT_SESSION_TURNS) || 6,
  CREATOR_RAG_TOP_K: Number(process.env.CREATOR_RAG_TOP_K) || 8,
  USER_MEMORY_TOP_K: Number(process.env.USER_MEMORY_TOP_K) || 5,
  MEMORY_DEDUP_THRESHOLD: Number(process.env.MEMORY_DEDUP_THRESHOLD) || 0.85,
  USER_MEMORY_MAX_PER_SCOPE:
    Number(process.env.USER_MEMORY_MAX_PER_SCOPE) || 200,
};
