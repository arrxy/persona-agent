import express from "express";
import cors from "cors";
import authRouter from "./routes/authRouter.js";
import personaRouter from "./routes/personaRouter.js";
import agentRouter from "./routes/agentRouter.js";
import youtubeRouter from "./routes/youtubeRouter.js";
import { errorHandler } from "./middleware/auth.js";

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

app.use(errorHandler);

export default app;
