import type { Express } from "express";
import type { Server } from "node:http";
import { mountAppRoutes } from "./app.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { disconnectRedis } from "./config/redis.js";

export async function bootApp(app: Express, server: Server): Promise<void> {
  try {
    await mountAppRoutes(app);
    console.log("API routes mounted");
  } catch (err) {
    console.error("Failed to mount API routes:", err);
  }

  try {
    await connectDb();
  } catch (err) {
    console.error("MongoDB connection failed on startup:", err);
    console.error(
      "Server stays up for health checks; API requests needing DB will fail until MongoDB connects.",
    );
  }

  function shutdown(signal: string) {
    console.log(`${signal} received. Shutting down server...`);

    server.close(async (err) => {
      if (err) {
        console.error("Error while closing server:", err);
        process.exit(1);
      }

      await disconnectRedis();
      await disconnectDb();

      console.log("Server closed successfully.");
      process.exit(0);
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
