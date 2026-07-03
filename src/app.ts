import express, { type Express } from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { errorHandler } from "./middleware/auth.js";

export function createBaseApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      message: "Server is healthy",
    });
  });

  return app;
}

export async function mountAppRoutes(app: Express): Promise<void> {
  const [
    { default: authRouter },
    { default: personaRouter },
    { default: agentRouter },
    { default: youtubeRouter },
    { default: creatorsRouter },
  ] = await Promise.all([
    import("./routes/authRouter.js"),
    import("./routes/personaRouter.js"),
    import("./routes/agentRouter.js"),
    import("./routes/youtubeRouter.js"),
    import("./routes/creatorsRouter.js"),
  ]);

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
}
