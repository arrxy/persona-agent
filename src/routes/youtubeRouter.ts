// /api/v1/youtube
import { Router } from "express";
import {
  asyncHandler,
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requestCreator } from "../service/youtube.js";
import { CreatorRequest } from "../models/CreatorRequest.js";
import { AppError } from "../utils/errors.js";

const router = Router();

function validateChannelUrl(channelUrl: unknown): string {
  if (typeof channelUrl !== "string" || !channelUrl.trim()) {
    throw new AppError(400, "channelUrl is required");
  }
  return channelUrl.trim();
}

router.get(
  "/creator-requests",
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).userId!;

    const creatorRequests = await CreatorRequest.find({ userId })
      .sort({ updatedAt: -1 })
      .populate("creatorId", "name handle avatarUrl channelUrl personaStatus ingestion.selectedVideoCount personaConfig.language")
      .limit(20)
      .lean();

    res.status(200).json({ creatorRequests });
  }),
);

router.post(
  "/creator-request",
  authenticate,
  asyncHandler(async (req, res) => {
    const channelUrl = validateChannelUrl(req.body.channelUrl);
    const userId = (req as AuthenticatedRequest).userId!;

    const creatorRequest = await requestCreator({ userId, channelUrl });
    res.status(201).json({ creatorRequest });
  }),
);

export default router;
