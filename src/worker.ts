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
    let jobCount = 0;

    while (processed && !isShuttingDown) {
      processed = await processCreatorRequest(env.WORKER_ID);
      if (processed) {
        jobCount++;
      }
    }

    if (jobCount > 0) {
      console.log(`[worker] Poll finished — processed ${jobCount} creator request(s)`);
    } else {
      console.log("[worker] Poll finished — no pending creator requests");
    }
  } catch (error) {
    console.error("[worker] Poll error:", error);
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
    `[worker] Started (id=${env.WORKER_ID}, poll=${env.WORKER_POLL_INTERVAL_MS}ms)`,
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
  console.error("[worker] Failed to start:", error);
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
