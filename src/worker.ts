import { env } from "./config/env.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { processCreatorRequest } from "./jobs/processCreatorRequest.js";

let pollTimer: ReturnType<typeof setInterval> | undefined;
let isProcessing = false;
let isShuttingDown = false;

async function poll(): Promise<void> {
  if (isProcessing || isShuttingDown) {
    return;
  }

  isProcessing = true;

  try {
    let processed = true;

    while (processed && !isShuttingDown) {
      processed = await processCreatorRequest(env.WORKER_ID);
    }
  } catch (error) {
    console.error("Worker poll error:", error);
  } finally {
    isProcessing = false;
  }
}

async function start(): Promise<void> {
  if (!env.YOUTUBE_API_KEY) {
    throw new Error("Missing required environment variable: YOUTUBE_API_KEY");
  }

  await connectDb();

  console.log(
    `Creator ingestion worker started (id=${env.WORKER_ID}, poll=${env.WORKER_POLL_INTERVAL_MS}ms)`,
  );

  await poll();
  pollTimer = setInterval(() => {
    void poll();
  }, env.WORKER_POLL_INTERVAL_MS);

  async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;

    isShuttingDown = true;
    console.log(`${signal} received. Shutting down worker...`);

    if (pollTimer) {
      clearInterval(pollTimer);
    }

    while (isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await disconnectDb();
    console.log("Worker shut down successfully.");
    process.exit(0);
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

start().catch((error) => {
  console.error("Failed to start worker:", error);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});
