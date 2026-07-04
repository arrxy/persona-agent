import { type Types } from "mongoose";
import {
  TranscriptChunk,
  type ITranscriptChunk,
  type ITranscriptChunkDocument,
} from "../models/TranscriptChunk.js";

export interface ProfileSampleChunk {
  text: string;
  videoId: Types.ObjectId;
}

export interface QdrantMetadataUpdate {
  collectionName: string;
  pointId: string;
  vectorModel: string;
  indexedAt: Date;
}

export class TranscriptChunkRepository {
  async countEmbeddedByCreator(
    creatorId: Types.ObjectId | string,
  ): Promise<number> {
    return TranscriptChunk.countDocuments({
      creatorId,
      "qdrant.pointId": { $exists: true },
    });
  }

  async findProfileSampleChunks(
    creatorId: Types.ObjectId | string,
    videoIds: Types.ObjectId[],
    limit: number,
  ): Promise<ProfileSampleChunk[]> {
    return TranscriptChunk.find({
      creatorId,
      videoId: { $in: videoIds },
    })
      .sort({ "quality.hasGoodSignal": -1 })
      .limit(limit)
      .select("text videoId")
      .lean();
  }

  async findByCreatorYoutubeChunkIndex(params: {
    creatorId: Types.ObjectId | string;
    youtubeVideoId: string;
    chunkIndex: number;
  }): Promise<ITranscriptChunkDocument | null> {
    return TranscriptChunk.findOne({
      creatorId: params.creatorId,
      youtubeVideoId: params.youtubeVideoId,
      chunkIndex: params.chunkIndex,
    });
  }

  async deleteByVideoId(
    videoId: Types.ObjectId | string,
  ): Promise<void> {
    await TranscriptChunk.deleteMany({ videoId });
  }

  async insertMany(
    chunks: Omit<ITranscriptChunk, "qdrant">[],
  ): Promise<ITranscriptChunkDocument[]> {
    return TranscriptChunk.insertMany(chunks);
  }

  async updateQdrantMetadata(
    chunkId: Types.ObjectId,
    qdrant: QdrantMetadataUpdate,
  ): Promise<void> {
    await TranscriptChunk.findByIdAndUpdate(chunkId, {
      $set: { qdrant },
    });
  }
}

export const transcriptChunkRepository = new TranscriptChunkRepository();
