import { Router } from "express";
import {
  asyncHandler,
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { AppError } from "../utils/errors.js";
import { Creator } from "../models/Creator.js";

const router = Router();

router.get(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const creators = await Creator.find({
      "ingestion.selectedVideoCount": { $gt: 0 },
    })
      .sort({ name: 1 })
      .select(
        "name handle description avatarUrl channelUrl stats personaStatus ingestion.selectedVideoCount",
      )
      .lean();

    res.status(200).json({
      creators: creators.map((creator) => ({
        id: creator._id.toString(),
        name: creator.name,
        handle: creator.handle,
        description: creator.description,
        avatarUrl: creator.avatarUrl,
        channelUrl: creator.channelUrl,
        subscriberCount: creator.stats?.subscriberCount,
        selectedVideoCount: creator.ingestion.selectedVideoCount,
        personaStatus: creator.personaStatus,
      })),
    });
  }),
);

router.get(
  "/:creatorId",
  authenticate,
  asyncHandler(async (req, res) => {
    const creator = await Creator.findById(req.params.creatorId).lean();

    if (!creator) {
      throw new AppError(404, "Creator not found");
    }

    res.status(200).json({
      creator: {
        id: creator._id.toString(),
        name: creator.name,
        handle: creator.handle,
        channelUrl: creator.channelUrl,
        avatarUrl: creator.avatarUrl,
        personaStatus: creator.personaStatus,
        language: creator.personaConfig.language,
        selectedVideoCount: creator.ingestion.selectedVideoCount,
        disclaimer: creator.personaConfig.disclaimer,
      },
    });
  }),
);

export default router;
