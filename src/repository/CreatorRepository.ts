import { type Types } from "mongoose";
import { CreatorSource, PersonaStatus } from "../enums.js";
import {
  Creator,
  type ICreatorDocument,
} from "../models/Creator.js";
import type { ResolvedChannel } from "../service/youtube/channel.js";

export class CreatorRepository {
  async findById(
    creatorId: Types.ObjectId | string,
  ): Promise<ICreatorDocument | null> {
    return Creator.findById(creatorId);
  }

  async upsertFromChannel(
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

  async save(creator: ICreatorDocument): Promise<ICreatorDocument> {
    return creator.save();
  }
}

export const creatorRepository = new CreatorRepository();
