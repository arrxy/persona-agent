// /api/v1/persona
import { Router } from "express";
import {
  asyncHandler,
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { AppError } from "../utils/errors.js";
import { ConversationMode } from "../enums.js";
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

function validateChatMode(mode: unknown): ConversationMode {
  if (mode === ConversationMode.SARCASTIC) {
    return ConversationMode.SARCASTIC;
  }
  return ConversationMode.CHAT;
}

router.get("/", (_req, res) => {
  res.status(200).json({
    message: "Persona API",
    endpoints: [
      "POST /chat",
      "GET /conversations",
      "GET /conversations/:id/messages",
      "DELETE /conversations/:id",
    ],
  });
});

router.get(
  "/conversations",
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).userId!;

    const conversations = await Conversation.find({ userId, deletedAt: null })
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
      deletedAt: null,
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

router.delete(
  "/conversations/:conversationId",
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).userId!;
    const { conversationId } = req.params;

    const conversation = await Conversation.findOneAndUpdate(
      { _id: conversationId, userId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { new: true },
    );

    if (!conversation) {
      throw new AppError(404, "Conversation not found");
    }

    res.status(200).json({ message: "Conversation deleted" });
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
    const mode = validateChatMode(req.body.mode);

    const result = await chatWithPersona({
      userId,
      creatorId,
      conversationId,
      message,
      mode,
    });

    res.status(200).json(result);
  }),
);

export default router;
