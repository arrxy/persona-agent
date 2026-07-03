import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
  CreatorSource,
  IngestionStrategy,
  PersonaMode,
  PersonaStatus,
} from "../enums.js";

export interface ICreator {
  channelId: string;
  channelUrl: string;
  handle?: string;

  name: string;
  description?: string;

  avatarUrl?: string;
  bannerUrl?: string;

  source: CreatorSource;

  personaStatus: PersonaStatus;

  isPinned: boolean;
  pinnedOrder?: number;

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
    sourceVideoLimit?: number;
  };

  personaConfig: {
    language: string;
    tone: string[];
    allowedMode: PersonaMode;
    disclaimer?: string;

    styleStrength: number;

    identityPolicy: {
      canClaimToBeCreator: boolean;
      mustDiscloseFanMade: boolean;
      canUseFirstPerson: boolean;
      canMentionCreatorName: boolean;
    };
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

    channelUrl: {
      type: String,
      required: true,
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
      enum: Object.values(CreatorSource),
      default: CreatorSource.YOUTUBE,
      required: true,
    },

    personaStatus: {
      type: String,
      enum: Object.values(PersonaStatus),
      default: PersonaStatus.NOT_STARTED,
      required: true,
    },

    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },

    pinnedOrder: {
      type: Number,
      min: 0,
      max: 2,
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
        enum: Object.values(IngestionStrategy),
        default: IngestionStrategy.TOP_VIEWS_LONGEST,
      },

      sourceVideoLimit: {
        type: Number,
        default: 100,
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
        enum: Object.values(PersonaMode),
        default: PersonaMode.STYLE_SIMULATION,
      },

      disclaimer: {
        type: String,
        default:
          "This is an AI persona generated from public YouTube content. It is not the real creator.",
      },

      styleStrength: {
        type: Number,
        min: 0,
        max: 1,
        default: 1,
      },

      identityPolicy: {
        canClaimToBeCreator: {
          type: Boolean,
          default: false,
        },

        mustDiscloseFanMade: {
          type: Boolean,
          default: true,
        },

        canUseFirstPerson: {
          type: Boolean,
          default: true,
        },

        canMentionCreatorName: {
          type: Boolean,
          default: true,
        },
      },
    },
  },
  { timestamps: true },
);

creatorSchema.index({ personaStatus: 1 });
creatorSchema.index({ isPinned: 1, pinnedOrder: 1 });
creatorSchema.index({ handle: 1 });
creatorSchema.index({ "ingestion.lastIngestedAt": 1 });

export const Creator: Model<ICreatorDocument> =
  mongoose.models.Creator ??
  mongoose.model<ICreatorDocument>("Creator", creatorSchema);