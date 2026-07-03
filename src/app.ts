import express from "express";
import cors from "cors";
import authRouter from "./routes/authRouter.js";
import personaRouter from "./routes/personaRouter.js";
import agentRouter from "./routes/agentRouter.js";
import youtubeRouter from "./routes/youtubeRouter.js";
import creatorsRouter from "./routes/creatorsRouter.js";
import { errorHandler } from "./middleware/auth.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Server is healthy",
  });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/persona", personaRouter);
app.use("/api/v1/agent", agentRouter);
app.use("/api/v1/youtube", youtubeRouter);
app.use("/api/v1/creators", creatorsRouter);

const clientDist = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../client/dist",
);
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (_req, res, next) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

app.use(errorHandler);

export default app;
