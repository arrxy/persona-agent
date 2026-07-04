import type { ICreatorDocument } from "../../models/Creator.js";
import { creatorRepository } from "../../repository/CreatorRepository.js";
import { creatorVideoRepository } from "../../repository/CreatorVideoRepository.js";
import type { ResolvedChannel, ChannelVideo } from "./channel.js";

export async function upsertCreatorFromChannel(
  channel: ResolvedChannel,
): Promise<ICreatorDocument> {
  return creatorRepository.upsertFromChannel(channel);
}

export async function upsertCreatorVideos(
  creatorId: ICreatorDocument["_id"],
  normalizedChannelId: string,
  videos: ChannelVideo[],
): Promise<void> {
  await creatorVideoRepository.bulkUpsertFromChannelVideos(
    creatorId,
    normalizedChannelId,
    videos,
  );
}
