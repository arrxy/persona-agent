import { type Types } from "mongoose";
import { env } from "../config/env.js";
import { VideoProcessingStatus } from "../enums.js";
import {
  CreatorVideo,
  type ICreatorVideoDocument,
} from "../models/CreatorVideo.js";

export class CreatorVideoRepository {
  async findByCreatorAndYoutubeVideoId(
    creatorId: Types.ObjectId | string,
    youtubeVideoId: string,
  ): Promise<ICreatorVideoDocument | null> {
    return CreatorVideo.findOne({ creatorId, youtubeVideoId });
  }

  async save(video: ICreatorVideoDocument): Promise<ICreatorVideoDocument> {
    return video.save();
  }

  async countSelected(creatorId: Types.ObjectId | string): Promise<number> {
    return CreatorVideo.countDocuments({
      creatorId,
      "selection.selectedForPersona": true,
    });
  }

  async countWithTranscript(creatorId: Types.ObjectId | string): Promise<number> {
    return CreatorVideo.countDocuments({
      creatorId,
      "transcript.available": true,
    });
  }

  async countNeedingTranscript(
    creatorId: Types.ObjectId | string,
    youtubeVideoIds: string[],
  ): Promise<number> {
    if (youtubeVideoIds.length === 0) return 0;

    return CreatorVideo.countDocuments({
      creatorId,
      youtubeVideoId: { $in: youtubeVideoIds },
      $or: [
        { "transcript.available": { $ne: true } },
        { "processing.status": VideoProcessingStatus.FAILED },
      ],
    });
  }

  async sumSelectedTranscriptSeconds(
    creatorId: Types.ObjectId | string,
  ): Promise<number> {
    const rows = await CreatorVideo.aggregate([
      {
        $match: {
          creatorId,
          "selection.selectedForPersona": true,
          "transcript.available": true,
        },
      },
      {
        $group: {
          _id: null,
          totalSeconds: { $sum: "$transcript.totalSeconds" },
        },
      },
    ]);

    return rows[0]?.totalSeconds ?? 0;
  }

  async deselectOutsideCandidates(
    creatorId: Types.ObjectId | string,
    candidateYoutubeIds: string[],
  ): Promise<void> {
    await CreatorVideo.updateMany(
      {
        creatorId,
        youtubeVideoId: { $nin: candidateYoutubeIds },
      },
      {
        $set: {
          "selection.selectedForPersona": false,
          "selection.reason": "not_in_top_candidates",
        },
      },
    );
  }

  async getDominantSelectedLanguage(
    creatorId: Types.ObjectId | string,
  ): Promise<string | undefined> {
    const rows = await CreatorVideo.aggregate([
      {
        $match: {
          creatorId,
          "selection.selectedForPersona": true,
          "transcript.available": true,
        },
      },
      { $group: { _id: "$transcript.language", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const language = rows[0]?._id;
    return typeof language === "string" ? language : undefined;
  }

  async selectFallbackVideos(
    creatorId: Types.ObjectId | string,
    limit = env.FALLBACK_SELECT_LIMIT,
  ): Promise<number> {
    const videos = await CreatorVideo.find({
      creatorId,
      "transcript.available": true,
      "selection.selectedForPersona": false,
    })
      .sort({ "selection.rankScore": -1, "stats.viewCount": -1 })
      .limit(limit);

    for (const video of videos) {
      video.selection.selectedForPersona = true;
      video.selection.reason = "fallback_top_ranked";
      await video.save();
    }

    return videos.length;
  }
}

export const creatorVideoRepository = new CreatorVideoRepository();
