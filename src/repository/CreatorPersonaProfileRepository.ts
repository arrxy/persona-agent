import { type Types } from "mongoose";
import {
  CreatorPersonaProfile,
  type ICreatorPersonaProfile,
  type ICreatorPersonaProfileDocument,
} from "../models/CreatorPersonaProfile.js";

export type CreatorPersonaProfileRecord = ICreatorPersonaProfile & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export interface UpsertCreatorPersonaProfileInput {
  creatorId: Types.ObjectId;
  version: number;
  summary?: string;
  speakingStyle: ICreatorPersonaProfile["speakingStyle"];
  beliefsAndOpinions: ICreatorPersonaProfile["beliefsAndOpinions"];
  interests: ICreatorPersonaProfile["interests"];
  doAndDont: ICreatorPersonaProfile["doAndDont"];
  generatedFrom: ICreatorPersonaProfile["generatedFrom"];
}

export class CreatorPersonaProfileRepository {
  async findLatestByCreatorId(
    creatorId: Types.ObjectId | string,
  ): Promise<CreatorPersonaProfileRecord | null> {
    return CreatorPersonaProfile.findOne({ creatorId })
      .sort({ version: -1 })
      .lean();
  }

  async getLatestVersion(
    creatorId: Types.ObjectId | string,
  ): Promise<number> {
    const latest = await CreatorPersonaProfile.findOne({ creatorId })
      .sort({ version: -1 })
      .select("version")
      .lean();

    return latest?.version ?? 0;
  }

  async upsert(
    input: UpsertCreatorPersonaProfileInput,
  ): Promise<ICreatorPersonaProfileDocument> {
    return CreatorPersonaProfile.findOneAndUpdate(
      { creatorId: input.creatorId, version: input.version },
      {
        creatorId: input.creatorId,
        version: input.version,
        summary: input.summary,
        speakingStyle: input.speakingStyle,
        beliefsAndOpinions: input.beliefsAndOpinions,
        interests: input.interests,
        doAndDont: input.doAndDont,
        sampleResponses: [],
        generatedFrom: input.generatedFrom,
      },
      { upsert: true, new: true },
    );
  }
}

export const creatorPersonaProfileRepository =
  new CreatorPersonaProfileRepository();
