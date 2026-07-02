import { Redis } from "ioredis";
import { env } from "./env.js";

export const redis = new Redis(env.REDIS_URL);

redis.on("connect", () => {
  console.log("Connected to Redis");
});

redis.on("error", (err: Error) => {
  console.error("Redis error:", err);
});

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  console.log("Disconnected from Redis");
}
