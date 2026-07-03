// /api/v1/persona
import { Router } from "express";
import {
  asyncHandler,
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { AppError } from "../utils/errors.js";
import { chatWithPersona } from "../service/persona/chat.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";

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
    endpoints: [
      "POST /chat",
      "GET /conversations",
      "GET /conversations/:id/messages",
    ],
  });
});

router.get(
  "/conversations",
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).userId!;

    const conversations = await Conversation.find({ userId })
      .sort({ updatedAt: -1 })
      .populate("creatorId", "name handle avatarUrl")
      .limit(50)
      .lean();

    res.status(200).json({ conversations });
  }),
);

router.get(
  "/conversations/:conversationId/messages",
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).userId!;
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      userId,
    }).populate("creatorId", "name handle avatarUrl");

    if (!conversation) {
      throw new AppError(404, "Conversation not found");
    }

    const messages = await Message.find({ conversationId: conversation._id })
      .sort({ createdAt: 1 })
      .lean();

    res.status(200).json({ conversation, messages });
  }),
);

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
