import { type Types } from "mongoose";
import { TranscriptChunk } from "../models/TranscriptChunk.js";

export class TranscriptChunkRepository {
  async countEmbeddedByCreator(
    creatorId: Types.ObjectId | string,
  ): Promise<number> {
    return TranscriptChunk.countDocuments({
      creatorId,
      "qdrant.pointId": { $exists: true },
    });
  }
}

export const transcriptChunkRepository = new TranscriptChunkRepository();
