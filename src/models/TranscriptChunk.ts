import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export type ChunkSentiment = "positive" | "neutral" | "negative";

export type ChunkContentType = "tutorial" | "story" | "opinion" | "review" | "interview" | "rant" | "general";

export interface ITranscriptChunk {
  creatorId: Types.ObjectId;
  videoId: Types.ObjectId;

  youtubeVideoId: string;

  chunkIndex: number;

  text: string;
  tokenCount?: number;

  startSeconds?: number;
  endSeconds?: number;

  source: {
    videoTitle: string;
    videoUrl: string;
    publishedAt?: Date;
  };

  qdrant?: {
    collectionName: string;
    pointId: string;
    vectorModel: string;
    indexedAt?: Date;
  };

  metadata: {
    language: string;
    topics: string[];
    entities: string[];
    sentiment?: ChunkSentiment;
    contentType?: ChunkContentType;
  };

  quality: {
    hasGoodSignal: boolean;
    noiseScore?: number;
    transcriptConfidence?: number;
  };
}

export interface ITranscriptChunkDocument extends ITranscriptChunk, Document {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

const transcriptChunkSchema = new Schema<ITranscriptChunkDocument>(
  {
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "Creator",
      required: true,
      index: true,
    },

    videoId: {
      type: Schema.Types.ObjectId,
      ref: "CreatorVideo",
      required: true,
      index: true,
    },

    youtubeVideoId: {
      type: String,
      required: true,
      trim: true,
    },

    chunkIndex: {
      type: Number,
      required: true,
      min: 0,
    },

    text: {
      type: String,
      required: true,
    },

    tokenCount: Number,

    startSeconds: Number,
    endSeconds: Number,

    source: {
      videoTitle: {
        type: String,
        required: true,
      },
      videoUrl: {
        type: String,
        required: true,
      },
      publishedAt: Date,
    },

    qdrant: {
      collectionName: {
        type: String,
      },
      pointId: {
        type: String,
      },
      vectorModel: {
        type: String,
      },
      indexedAt: Date,
    },

    metadata: {
      language: {
        type: String,
        default: "en",
      },
      topics: {
        type: [String],
        default: [],
      },
      entities: {
        type: [String],
        default: [],
      },
      sentiment: {
        type: String,
        enum: ["positive", "neutral", "negative"],
      },
      contentType: {
        type: String,
        enum: [
          "tutorial",
          "story",
          "opinion",
          "review",
          "interview",
          "rant",
          "general",
        ],
        default: "general",
      },
    },

    quality: {
      hasGoodSignal: {
        type: Boolean,
        default: true,
      },
      noiseScore: Number,
      transcriptConfidence: Number,
    },
  },
  { timestamps: true },
);

transcriptChunkSchema.index(
  { creatorId: 1, videoId: 1, chunkIndex: 1 },
  { unique: true },
);

transcriptChunkSchema.index({ creatorId: 1, "metadata.topics": 1 });
transcriptChunkSchema.index({ creatorId: 1, "metadata.entities": 1 });
transcriptChunkSchema.index({ creatorId: 1, youtubeVideoId: 1 });
transcriptChunkSchema.index({ "qdrant.pointId": 1 });
transcriptChunkSchema.index({ creatorId: 1, "qdrant.indexedAt": 1 });

export const TranscriptChunk: Model<ITranscriptChunkDocument> =
  mongoose.models.TranscriptChunk ??
  mongoose.model<ITranscriptChunkDocument>(
    "TranscriptChunk",
    transcriptChunkSchema,
  );