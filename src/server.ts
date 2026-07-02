import app from "./app.js";
import { env } from "./config/env.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { disconnectRedis } from "./config/redis.js";

async function start() {
  await connectDb();

  const server = app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });

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
