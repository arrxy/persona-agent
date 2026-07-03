import {
  CreatorRequestStatus,
  TranscriptSource,
  VideoProcessingStatus,
} from "../enums.js";
import { CreatorRequest } from "../models/CreatorRequest.js";
import { CreatorVideo } from "../models/CreatorVideo.js";
import { TranscriptChunk } from "../models/TranscriptChunk.js";
import { creatorRequestRepository } from "../repository/CreatorRequestRepository.js";
import {
  listChannelUploads,
  resolveChannel,
} from "../service/youtube/channel.js";
import {
  upsertCreatorFromChannel,
  upsertCreatorVideos,
} from "../service/youtube/ingestion.js";
import { embedSelectedCreatorVideos } from "../service/ingestion/embedVideo.js";
import {
  getTranscriptCandidateVideos,
  scoreCreatorPresence,
  selectFallbackVideos,
} from "../service/youtube/videoSelection.js";
import { embedVideoTranscript } from "../service/ingestion/embedVideo.js";
import { normalizePersonaLanguage } from "../service/persona/language.js";
import {
  fetchTranscriptsFromIoApi,
  getYoutubeTranscript,
  isTranscriptIoConfigured,
  type TranscriptSegment,
} from "../service/youtube.js";
import type { ICreatorDocument } from "../models/Creator.js";

const MAX_ATTEMPTS = 3;

function getRetryDelayMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(attempts - 1, 0), 3_600_000);
}

async function handleJobFailure(
  requestId: string,
  attempts: number,
  code: string,
  message: string,
): Promise<void> {
  if (attempts < MAX_ATTEMPTS) {
    await CreatorRequest.findByIdAndUpdate(requestId, {
      $set: {
        status: CreatorRequestStatus.PENDING,
        error: { code, message },
        "processing.nextRetryAt": new Date(
          Date.now() + getRetryDelayMs(attempts),
        ),
      },
    });
    return;
  }

  await creatorRequestRepository.markFailed({
    requestId,
    code,
    message,
  });
}

async function fetchAndScoreVideo(params: {
  creator: ICreatorDocument;
  creatorId: string;
  youtubeVideoId: string;
  creatorName: string;
  handle?: string;
  segments?: TranscriptSegment[];
}): Promise<void> {
  const video = await CreatorVideo.findOne({
    creatorId: params.creatorId,
    youtubeVideoId: params.youtubeVideoId,
  });

  if (!video) return;

  try {
    let segments = params.segments;
    if (segments !== undefined && segments.length === 0) {
      throw new Error(`No transcript available for video ${params.youtubeVideoId}`);
    }

    segments ??= await getYoutubeTranscript(params.youtubeVideoId);
    const transcriptText = segments.map((segment) => segment.text).join(" ");
    const wordCount = transcriptText.split(/\s+/).filter(Boolean).length;
    const totalSeconds = segments.at(-1)?.endSeconds ?? 0;
    const selection = scoreCreatorPresence({
      video: {
        youtubeVideoId: video.youtubeVideoId,
        channelId: video.channelId,
        url: video.url,
        title: video.title,
        durationSeconds: video.durationSeconds,
      },
      creatorName: params.creatorName,
      handle: params.handle,
      transcriptText,
    });

    video.transcript = {
      available: true,
      source: isTranscriptIoConfigured()
        ? TranscriptSource.THIRD_PARTY
        : TranscriptSource.YOUTUBE,
      language: selection.detectedLanguage,
      fetchedAt: new Date(),
      totalSeconds,
      wordCount,
    };
    video.selection = {
      selectedForPersona: selection.selectedForPersona,
      rankScore: selection.rankScore,
      reason: selection.reason,
    };
    video.processing = {
      status: VideoProcessingStatus.TRANSCRIPT_FETCHED,
    };
    await video.save();

    console.log(
      `[worker] Video ${params.youtubeVideoId}: transcript ok, selected=${selection.selectedForPersona}, score=${selection.rankScore.toFixed(2)}${selection.reason ? `, reason=${selection.reason}` : ""}`,
    );

    if (selection.selectedForPersona) {
      try {
        await embedVideoTranscript({
          creator: params.creator,
          video,
          segments,
        });
      } catch (embedError) {
        const embedMsg =
          embedError instanceof Error ? embedError.message : String(embedError);
        video.processing = {
          status: VideoProcessingStatus.TRANSCRIPT_FETCHED,
          error: `embed_failed: ${embedMsg}`,
        };
        await video.save();
      }
    }

    return;
  } catch (error) {
    video.selection = {
      selectedForPersona: false,
      rankScore: 0,
      reason: "no_transcript",
    };
    video.processing = {
      status: VideoProcessingStatus.FAILED,
      error: error instanceof Error ? error.message : "Transcript fetch failed",
    };
    await video.save();
    console.log(
      `[worker] Video ${params.youtubeVideoId}: no transcript (${error instanceof Error ? error.message : "fetch failed"})`,
    );
  }
}

export async function processCreatorRequest(
  workerId: string,
): Promise<boolean> {
  const request =
    await creatorRequestRepository.claimNextPendingRequest(workerId);

  if (!request) {
    return false;
  }

  const requestId = request._id.toString();
  const attempts = request.processing.attempts;

  console.log(
    `[worker] Claimed request ${requestId} (attempt ${attempts}, channel=${request.inputChannelUrl})`,
  );

  try {
    const channel = await resolveChannel(request.inputChannelUrl);
    console.log(
      `[worker] Resolved channel "${channel.name}" (${channel.channelId}, handle=${channel.handle ?? "none"})`,
    );

    const creator = await upsertCreatorFromChannel(channel);

    await creatorRequestRepository.attachCreator({
      requestId,
      creatorId: creator._id,
      normalizedChannelId: channel.channelId,
    });

    const sourceVideoLimit = creator.ingestion.sourceVideoLimit ?? 100;
    const videos = await listChannelUploads(
      channel.uploadsPlaylistId,
      channel.channelId,
      sourceVideoLimit,
    );

    await upsertCreatorVideos(creator._id, channel.channelId, videos);
    console.log(
      `[worker] Listed ${videos.length} videos from uploads playlist`,
    );

    const candidates = getTranscriptCandidateVideos(
      videos,
      creator.ingestion.strategy,
    );
    console.log(
      `[worker] Scoring ${candidates.length} transcript candidates (strategy=${creator.ingestion.strategy})`,
    );

    const transcriptMap = isTranscriptIoConfigured()
      ? await fetchTranscriptsFromIoApi(
          candidates.map((candidate) => candidate.youtubeVideoId),
        )
      : undefined;

    if (transcriptMap) {
      console.log(
        `[worker] Fetched ${transcriptMap.size} transcripts via youtube-transcript.io API`,
      );
    }

    for (const candidate of candidates) {
      await fetchAndScoreVideo({
        creator,
        creatorId: creator._id.toString(),
        youtubeVideoId: candidate.youtubeVideoId,
        creatorName: channel.name,
        handle: channel.handle,
        segments: transcriptMap?.get(candidate.youtubeVideoId),
      });
    }

    let selectedVideoCount = await CreatorVideo.countDocuments({
      creatorId: creator._id,
      "selection.selectedForPersona": true,
    });

    if (selectedVideoCount === 0) {
      const transcriptCount = await CreatorVideo.countDocuments({
        creatorId: creator._id,
        "transcript.available": true,
      });

      console.log(
        `[worker] No videos passed selection threshold (${transcriptCount} with transcripts)`,
      );

      if (transcriptCount === 0) {
        throw new Error(
          "No fetchable transcripts found on this channel. Videos may not have captions enabled.",
        );
      }

      selectedVideoCount = await selectFallbackVideos({
        creatorId: creator._id.toString(),
      });
      console.log(
        `[worker] Fallback selected ${selectedVideoCount} video(s) by rank/views`,
      );
    } else {
      console.log(
        `[worker] ${selectedVideoCount} video(s) passed selection threshold`,
      );
    }

    await CreatorVideo.updateMany(
      {
        creatorId: creator._id,
        youtubeVideoId: {
          $nin: candidates.map((video) => video.youtubeVideoId),
        },
      },
      {
        $set: {
          "selection.selectedForPersona": false,
          "selection.reason": "not_in_top_candidates",
        },
      },
    );

    creator.ingestion.selectedVideoCount = selectedVideoCount;
    creator.ingestion.collectedTranscriptSeconds = await CreatorVideo.aggregate(
      [
        {
          $match: {
            creatorId: creator._id,
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
      ],
    ).then((rows) => rows[0]?.totalSeconds ?? 0);

    const languageBreakdown = await CreatorVideo.aggregate([
      {
        $match: {
          creatorId: creator._id,
          "selection.selectedForPersona": true,
          "transcript.available": true,
        },
      },
      { $group: { _id: "$transcript.language", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const dominantLanguage = languageBreakdown[0]?._id;
    if (typeof dominantLanguage === "string") {
      creator.personaConfig.language =
        normalizePersonaLanguage(dominantLanguage);
    }

    await embedSelectedCreatorVideos(creator);
    console.log("[worker] Embedding pass complete for selected videos");

    const embeddedChunkCount = await TranscriptChunk.countDocuments({
      creatorId: creator._id,
      "qdrant.collectionName": { $exists: true },
    });

    await creator.save();

    const completionMessage = `Ingested ${videos.length} videos, selected ${selectedVideoCount} for persona, embedded ${embeddedChunkCount} chunks`;

    await creatorRequestRepository.markCompleted({
      requestId,
      creatorId: creator._id,
      normalizedChannelId: channel.channelId,
      message: completionMessage,
    });

    console.log(
      `[worker] Request ${requestId} completed: ${completionMessage}`,
    );

    return true;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Creator request processing failed";

    await handleJobFailure(requestId, attempts, "INGESTION_FAILED", message);
    if (attempts < MAX_ATTEMPTS) {
      console.warn(
        `[worker] Request ${requestId} failed (attempt ${attempts}/${MAX_ATTEMPTS}), will retry: ${message}`,
      );
    } else {
      console.error(`[worker] Request ${requestId} failed permanently:`, error);
    }
    return true;
  }
}
