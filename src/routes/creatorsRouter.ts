import { Router } from "express";
import {
  asyncHandler,
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { AppError } from "../utils/errors.js";
import { Creator } from "../models/Creator.js";
import { requestCreatorReingest } from "../service/youtube.js";

const router = Router();

const MAX_PINNED_CREATORS = 3;

const readyCreatorFilter = {
  "ingestion.selectedVideoCount": { $gt: 0 },
};

const creatorFields =
  "name handle description avatarUrl channelUrl stats personaStatus ingestion.selectedVideoCount isPinned pinnedOrder";

function mapCreator(creator: {
  _id: { toString(): string };
  name: string;
  handle?: string;
  description?: string;
  avatarUrl?: string;
  channelUrl?: string;
  stats?: { subscriberCount?: number };
  ingestion: { selectedVideoCount: number };
  personaStatus: string;
  isPinned?: boolean;
  pinnedOrder?: number;
}) {
  return {
    id: creator._id.toString(),
    name: creator.name,
    handle: creator.handle,
    description: creator.description,
    avatarUrl: creator.avatarUrl,
    channelUrl: creator.channelUrl,
    subscriberCount: creator.stats?.subscriberCount,
    selectedVideoCount: creator.ingestion.selectedVideoCount,
    personaStatus: creator.personaStatus,
    isPinned: Boolean(creator.isPinned),
    pinnedOrder: creator.pinnedOrder,
  };
}

router.get(
  "/",
  authenticate,
  asyncHandler(async (_req, res) => {
    const pinnedCreators = await Creator.find({
      ...readyCreatorFilter,
      isPinned: true,
    })
      .sort({ pinnedOrder: 1, name: 1 })
      .limit(MAX_PINNED_CREATORS)
      .select(creatorFields)
      .lean();

    const pinnedIds = pinnedCreators.map((creator) => creator._id);

    const exploreCreators = await Creator.find({
      ...readyCreatorFilter,
      _id: { $nin: pinnedIds },
    })
      .sort({ name: 1 })
      .select(creatorFields)
      .lean();

    res.status(200).json({
      pinned: pinnedCreators.map(mapCreator),
      creators: exploreCreators.map(mapCreator),
    });
  }),
);

router.post(
  "/:creatorId/reingest",
  authenticate,
  asyncHandler(async (req, res) => {
    const creator = await Creator.findById(req.params.creatorId).lean();

    if (!creator?.channelUrl) {
      throw new AppError(404, "Creator not found");
    }

    const userId = (req as AuthenticatedRequest).userId!;
    const creatorRequest = await requestCreatorReingest({
      userId,
      creatorId: creator._id.toString(),
      channelUrl: creator.channelUrl,
    });

    res.status(201).json({ creatorRequest });
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
        isPinned: Boolean(creator.isPinned),
        pinnedOrder: creator.pinnedOrder,
        language: creator.personaConfig.language,
        selectedVideoCount: creator.ingestion.selectedVideoCount,
        disclaimer: creator.personaConfig.disclaimer,
      },
    });
  }),
);

export default router;
