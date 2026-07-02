import mongoose, { Schema, type Document, type Model } from "mongoose";

export type CreatorSource = "youtube";

export type PersonaStatus = "collecting" | "processing" | "ready" | "failed";

export type IngestionStrategy = "top_views_longest" | "recent" | "manual";

export type PersonaMode = "inspired_by" | "quote_with_citations";

export interface ICreator {
  channelId: string;
  handle?: string;
  name: string;
  description?: string;

  avatarUrl?: string;
  bannerUrl?: string;

  source: CreatorSource;
  personaStatus: PersonaStatus;

  stats?: {
    subscriberCount?: number;
    videoCount?: number;
    totalViewCount?: number;
  };

  ingestion: {
    targetTranscriptHours: number;
    collectedTranscriptSeconds: number;
    selectedVideoCount: number;
    lastIngestedAt?: Date;
    strategy: IngestionStrategy;
  };

  personaConfig: {
    language: string;
    tone: string[];
    allowedMode: PersonaMode;
    disclaimer?: string;
  };
}

export interface ICreatorDocument extends ICreator, Document {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

const creatorSchema = new Schema<ICreatorDocument>(
  {
    channelId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    handle: {
      type: String,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,

    avatarUrl: String,
    bannerUrl: String,

    source: {
      type: String,
      enum: ["youtube"],
      default: "youtube",
      required: true,
    },

    personaStatus: {
      type: String,
      enum: ["collecting", "processing", "ready", "failed"],
      default: "collecting",
      required: true,
    },

    stats: {
      subscriberCount: Number,
      videoCount: Number,
      totalViewCount: Number,
    },

    ingestion: {
      targetTranscriptHours: {
        type: Number,
        default: 20,
      },
      collectedTranscriptSeconds: {
        type: Number,
        default: 0,
      },
      selectedVideoCount: {
        type: Number,
        default: 0,
      },
      lastIngestedAt: Date,
      strategy: {
        type: String,
        enum: ["top_views_longest", "recent", "manual"],
        default: "top_views_longest",
      },
    },

    personaConfig: {
      language: {
        type: String,
        default: "en",
      },
      tone: {
        type: [String],
        default: [],
      },
      allowedMode: {
        type: String,
        enum: ["inspired_by", "quote_with_citations"],
        default: "inspired_by",
      },
      disclaimer: String,
    },
  },
  { timestamps: true },
);

creatorSchema.index({ handle: 1 });
creatorSchema.index({ personaStatus: 1 });

export const Creator: Model<ICreatorDocument> = mongoose.models.Creator ?? mongoose.model<ICreatorDocument>("Creator", creatorSchema);