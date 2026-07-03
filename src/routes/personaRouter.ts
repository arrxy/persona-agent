// /api/v1/persona
import { Router } from "express";
import {
  asyncHandler,
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { AppError } from "../utils/errors.js";
import { chatWithPersona } from "../service/persona/chat.js";

const router = Router();

function validateCreatorId(creatorId: unknown): string {
  if (typeof creatorId !== "string" || !creatorId.trim()) {
    throw new AppError(400, "creatorId is required");
  }
  return creatorId.trim();
}

function validateMessage(message: unknown): string {
  if (typeof message !== "string" || !message.trim()) {
    throw new AppError(400, "message is required");
  }
  return message.trim();
}

router.get("/", (_req, res) => {
  res.status(200).json({
    message: "Persona API",
    endpoints: ["POST /chat"],
  });
});

router.post(
  "/chat",
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).userId!;
    const creatorId = validateCreatorId(req.body.creatorId);
    const message = validateMessage(req.body.message);
    const conversationId =
      typeof req.body.conversationId === "string"
        ? req.body.conversationId.trim()
        : undefined;

    const result = await chatWithPersona({
      userId,
      creatorId,
      conversationId,
      message,
    });

    res.status(200).json(result);
  }),
);

export default router;
