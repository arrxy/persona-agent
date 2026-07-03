import { createBaseApp, mountAppRoutes } from "./app.js";
import { env } from "./config/env.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { disconnectRedis } from "./config/redis.js";

async function start() {
  const app = createBaseApp();

  const server = app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${env.PORT}`);
  });

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

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});
