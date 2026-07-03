import { CreatorSource, PersonaStatus, VideoProcessingStatus } from "../../enums.js";
import { Creator, type ICreatorDocument } from "../../models/Creator.js";
import { CreatorVideo } from "../../models/CreatorVideo.js";
import type { ResolvedChannel, ChannelVideo } from "./channel.js";

export async function upsertCreatorFromChannel(
  channel: ResolvedChannel,
): Promise<ICreatorDocument> {
  const creator = await Creator.findOneAndUpdate(
    { channelId: channel.channelId },
    {
      $set: {
        channelUrl: channel.channelUrl,
        handle: channel.handle,
        name: channel.name,
        description: channel.description,
        avatarUrl: channel.avatarUrl,
        bannerUrl: channel.bannerUrl,
        stats: channel.stats,
        "ingestion.lastIngestedAt": new Date(),
      },
      $setOnInsert: {
        source: CreatorSource.YOUTUBE,
        personaStatus: PersonaStatus.NOT_STARTED,
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  if (!creator) {
    throw new Error(`Failed to upsert creator for channel ${channel.channelId}`);
  }

  return creator;
}

export async function upsertCreatorVideos(
  creatorId: ICreatorDocument["_id"],
  normalizedChannelId: string,
  videos: ChannelVideo[],
): Promise<void> {
  if (videos.length === 0) return;

  const operations = videos.map((video) => ({
    updateOne: {
      filter: {
        creatorId,
        youtubeVideoId: video.youtubeVideoId,
      },
      update: {
        $set: {
          channelId: normalizedChannelId,
          url: video.url,
          title: video.title,
          description: video.description,
          publishedAt: video.publishedAt,
          durationSeconds: video.durationSeconds,
          stats: video.stats,
        },
        $setOnInsert: {
          creatorId,
          youtubeVideoId: video.youtubeVideoId,
          transcript: { available: false },
          selection: { selectedForPersona: false },
          processing: { status: VideoProcessingStatus.PENDING },
        },
      },
      upsert: true,
    },
  }));

  await CreatorVideo.bulkWrite(operations);
}
