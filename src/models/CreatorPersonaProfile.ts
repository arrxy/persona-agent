import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface ICreatorPersonaProfile {
  creatorId: Types.ObjectId;

  version: number;

  summary?: string;

  speakingStyle: {
    tone: string[];
    pacing?: string;
    vocabulary: string[];
    humorStyle?: string;
    commonPhrases: string[];
    rhetoricalPatterns: string[];
  };

  beliefsAndOpinions: {
    topic: string;
    stance: string;
    confidence: number;
    evidenceChunkIds: Types.ObjectId[];
  }[];

  interests: {
    topic: string;
    weight: number;
    evidenceChunkIds: Types.ObjectId[];
  }[];

  doAndDont: {
    shouldDo: string[];
    shouldAvoid: string[];
  };

  sampleResponses: {
    prompt: string;
    response: string;
    basedOnChunkIds: Types.ObjectId[];
  }[];

  generatedFrom: {
    videoIds: Types.ObjectId[];
    chunkCount: number;
    transcriptHours: number;
  };
}

export interface ICreatorPersonaProfileDocument
  extends ICreatorPersonaProfile,
    Document {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

const creatorPersonaProfileSchema =
  new Schema<ICreatorPersonaProfileDocument>(
    {
      creatorId: {
        type: Schema.Types.ObjectId,
        ref: "Creator",
        required: true,
        index: true,
      },

      version: {
        type: Number,
        default: 1,
        required: true,
      },

      summary: String,

      speakingStyle: {
        tone: {
          type: [String],
          default: [],
        },
        pacing: String,
        vocabulary: {
          type: [String],
          default: [],
        },
        humorStyle: String,
        commonPhrases: {
          type: [String],
          default: [],
        },
        rhetoricalPatterns: {
          type: [String],
          default: [],
        },
      },

      beliefsAndOpinions: [
        {
          topic: {
            type: String,
            required: true,
          },
          stance: {
            type: String,
            required: true,
          },
          confidence: {
            type: Number,
            min: 0,
            max: 1,
            default: 0.5,
          },
          evidenceChunkIds: [
            {
              type: Schema.Types.ObjectId,
              ref: "TranscriptChunk",
            },
          ],
        },
      ],

      interests: [
        {
          topic: {
            type: String,
            required: true,
          },
          weight: {
            type: Number,
            min: 0,
            max: 1,
            default: 0.5,
          },
          evidenceChunkIds: [
            {
              type: Schema.Types.ObjectId,
              ref: "TranscriptChunk",
            },
          ],
        },
      ],

      doAndDont: {
        shouldDo: {
          type: [String],
          default: [],
        },
        shouldAvoid: {
          type: [String],
          default: [],
        },
      },

      sampleResponses: [
        {
          prompt: String,
          response: String,
          basedOnChunkIds: [
            {
              type: Schema.Types.ObjectId,
              ref: "TranscriptChunk",
            },
          ],
        },
      ],

      generatedFrom: {
        videoIds: [
          {
            type: Schema.Types.ObjectId,
            ref: "CreatorVideo",
          },
        ],
        chunkCount: {
          type: Number,
          default: 0,
        },
        transcriptHours: {
          type: Number,
          default: 0,
        },
      },
    },
    { timestamps: true },
  );

creatorPersonaProfileSchema.index(
  { creatorId: 1, version: -1 },
  { unique: true },
);

export const CreatorPersonaProfile: Model<ICreatorPersonaProfileDocument> =
  mongoose.models.CreatorPersonaProfile ??
  mongoose.model<ICreatorPersonaProfileDocument>(
    "CreatorPersonaProfile",
    creatorPersonaProfileSchema,
  );