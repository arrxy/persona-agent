import express from "express";
import cors from "cors";

const port = Number(process.env.PORT) || 3000;

const app = express();
app.use(cors());
app.use(express.json());
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", message: "Server is healthy" });
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Health server listening on http://0.0.0.0:${port}`);
});

import("./boot.js")
  .then(({ bootApp }) => bootApp(app, server))
  .catch((err) => {
    console.error("Failed to boot API:", err);
  });

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});
