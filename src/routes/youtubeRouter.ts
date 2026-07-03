// /api/v1/youtube
import { Router } from "express";
import {
  asyncHandler,
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requestCreator } from "../service/youtube.js";
import { AppError } from "../utils/errors.js";

const router = Router();

function validateChannelUrl(channelUrl: unknown): string {
  if (typeof channelUrl !== "string" || !channelUrl.trim()) {
    throw new AppError(400, "channelUrl is required");
  }
  return channelUrl.trim();
}

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
