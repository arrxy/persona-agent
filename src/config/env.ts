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
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  EMBEDDING_DIMENSIONS: Number(process.env.EMBEDDING_DIMENSIONS) || 1536,
  CHUNK_TARGET_WORDS: Number(process.env.CHUNK_TARGET_WORDS) || 400,
};
