import {
  TranscriptSource,
  VideoProcessingStatus,
} from "../enums.js";
import { env } from "../config/env.js";
import { creatorRepository } from "../repository/CreatorRepository.js";
import { creatorRequestRepository } from "../repository/CreatorRequestRepository.js";
import { creatorVideoRepository } from "../repository/CreatorVideoRepository.js";
import { transcriptChunkRepository } from "../repository/TranscriptChunkRepository.js";
import {
  listChannelUploads,
  resolveChannel,
} from "../service/youtube/channel.js";
import {
  upsertCreatorFromChannel,
  upsertCreatorVideos,
} from "../service/youtube/ingestion.js";
import {
  buildMergedCandidateList,
  getTranscriptCandidateBatch,
  scoreCreatorPresence,
  selectFallbackVideos,
} from "../service/youtube/videoSelection.js";
import {
  embedVideoTranscript,
  embedSelectedCreatorVideos,
} from "../service/ingestion/embedVideo.js";
import { buildCreatorPersonaProfile } from "../service/ingestion/personaProfile.js";
import { normalizePersonaLanguage } from "../service/persona/language.js";
import { getYoutubeTranscript } from "../service/youtube.js";
import type { ICreatorDocument } from "../models/Creator.js";

const MAX_ATTEMPTS = 3;

function getRetryDelayMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(attempts - 1, 0), 3_600_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleJobFailure(
  requestId: string,
  attempts: number,
  code: string,
  message: string,
): Promise<void> {
  if (attempts < MAX_ATTEMPTS) {
    await creatorRequestRepository.scheduleRetry({
      requestId,
      code,
      message,
      nextRetryAt: new Date(Date.now() + getRetryDelayMs(attempts)),
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
  youtubeVideoId: string;
  creatorName: string;
  handle?: string;
  skipIfTranscriptAvailable?: boolean;
}): Promise<boolean> {
  const video = await creatorVideoRepository.findByCreatorAndYoutubeVideoId(
    params.creator._id,
    params.youtubeVideoId,
  );

  if (!video) return false;

  if (
    params.skipIfTranscriptAvailable &&
    video.transcript?.available &&
    video.processing?.status !== VideoProcessingStatus.FAILED
  ) {
    return false;
  }

  try {
    const segments = await getYoutubeTranscript(params.youtubeVideoId);
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
      source: TranscriptSource.YOUTUBE,
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
    await creatorVideoRepository.save(video);

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
        await creatorVideoRepository.save(video);
      }
    }

    return true;
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
    await creatorVideoRepository.save(video);
    console.log(
      `[worker] Video ${params.youtubeVideoId}: no transcript (${error instanceof Error ? error.message : "fetch failed"})`,
    );
    return true;
  }
}

async function scoreCandidatesUntilTarget(params: {
  creator: ICreatorDocument;
  videos: Awaited<ReturnType<typeof listChannelUploads>>;
  creatorName: string;
  handle?: string;
  isReingest: boolean;
}): Promise<string[]> {
  const mergedList = buildMergedCandidateList(
    params.videos,
    params.creator.ingestion.strategy,
  );
  const targetSeconds = params.creator.ingestion.targetTranscriptHours * 3600;
  const batchSize = env.TRANSCRIPT_CANDIDATE_LIMIT;
  const processedVideoIds: string[] = [];
  let offset = 0;

  while (offset < mergedList.length) {
    const batch = getTranscriptCandidateBatch(
      params.videos,
      params.creator.ingestion.strategy,
      offset,
      batchSize,
    );

    if (batch.length === 0) break;

    console.log(
      `[worker] Transcript batch offset=${offset}, size=${batch.length} (target=${params.creator.ingestion.targetTranscriptHours}h)`,
    );

    for (const candidate of batch) {
      if (processedVideoIds.includes(candidate.youtubeVideoId)) continue;
      processedVideoIds.push(candidate.youtubeVideoId);

      const fetched = await fetchAndScoreVideo({
        creator: params.creator,
        youtubeVideoId: candidate.youtubeVideoId,
        creatorName: params.creatorName,
        handle: params.handle,
        skipIfTranscriptAvailable: params.isReingest,
      });

      if (fetched && env.TRANSCRIPT_FETCH_DELAY_MS > 0) {
        await sleep(env.TRANSCRIPT_FETCH_DELAY_MS);
      }
    }

    const collectedSeconds =
      await creatorVideoRepository.sumSelectedTranscriptSeconds(
        params.creator._id,
      );
    const remainingVideoIds = mergedList
      .slice(offset + batchSize)
      .map((video) => video.youtubeVideoId);
    const remainingNeedTranscript =
      await creatorVideoRepository.countNeedingTranscript(
        params.creator._id,
        remainingVideoIds,
      );
    const targetMet = collectedSeconds >= targetSeconds;

    if (targetMet && !params.isReingest) {
      console.log(
        `[worker] Target transcript hours reached (${(collectedSeconds / 3600).toFixed(1)}h)`,
      );
      break;
    }

    if (targetMet && params.isReingest && remainingNeedTranscript === 0) {
      console.log(
        `[worker] Re-ingest complete: target hours met and no remaining videos need transcripts`,
      );
      break;
    }

    offset += batchSize;
  }

  console.log(
    `[worker] Scored ${processedVideoIds.length} candidate(s)`,
  );

  return mergedList.map((video) => video.youtubeVideoId);
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
  const isReingest = Boolean(request.reingest);

  console.log(
    `[worker] Claimed request ${requestId} (attempt ${attempts}, channel=${request.inputChannelUrl}${isReingest ? ", reingest" : ""})`,
  );

  try {
    const channel = await resolveChannel(request.inputChannelUrl);
    console.log(
      `[worker] Resolved channel "${channel.name}" (${channel.channelId}, handle=${channel.handle ?? "none"})`,
    );

    let creator: ICreatorDocument;

    if (isReingest && request.creatorId) {
      const existing = await creatorRepository.findById(request.creatorId);
      if (!existing) {
        throw new Error("Re-ingest target creator not found");
      }
      creator = existing;
      console.log(`[worker] Re-ingesting existing creator ${creator.name}`);
    } else {
      creator = await upsertCreatorFromChannel(channel);
    }

    await creatorRequestRepository.attachCreator({
      requestId,
      creatorId: creator._id,
      normalizedChannelId: channel.channelId,
    });

    const sourceVideoLimit =
      creator.ingestion.sourceVideoLimit ?? env.DEFAULT_SOURCE_VIDEO_LIMIT;
    const videos = await listChannelUploads(
      channel.uploadsPlaylistId,
      channel.channelId,
      sourceVideoLimit,
    );

    await upsertCreatorVideos(creator._id, channel.channelId, videos);
    console.log(
      `[worker] Listed ${videos.length} videos from uploads playlist`,
    );

    const allCandidateIds = await scoreCandidatesUntilTarget({
      creator,
      videos,
      creatorName: channel.name,
      handle: channel.handle,
      isReingest,
    });

    let selectedBeforeDeselect = await creatorVideoRepository.countSelected(
      creator._id,
    );

    if (selectedBeforeDeselect === 0) {
      const transcriptCount = await creatorVideoRepository.countWithTranscript(
        creator._id,
      );

      console.log(
        `[worker] No videos passed selection threshold (${transcriptCount} with transcripts)`,
      );

      if (transcriptCount === 0) {
        throw new Error(
          "No fetchable transcripts found on this channel. Videos may not have captions enabled.",
        );
      }

      selectedBeforeDeselect = await selectFallbackVideos({
        creatorId: creator._id.toString(),
      });
      console.log(
        `[worker] Fallback selected ${selectedBeforeDeselect} video(s) by rank/views`,
      );
    } else {
      console.log(
        `[worker] ${selectedBeforeDeselect} video(s) passed selection threshold`,
      );
    }

    await creatorVideoRepository.deselectOutsideCandidates(
      creator._id,
      allCandidateIds,
    );

    const selectedVideoCount = await creatorVideoRepository.countSelected(
      creator._id,
    );

    creator.ingestion.selectedVideoCount = selectedVideoCount;
    creator.ingestion.collectedTranscriptSeconds =
      await creatorVideoRepository.sumSelectedTranscriptSeconds(creator._id);
    creator.ingestion.lastIngestedAt = new Date();

    const dominantLanguage =
      await creatorVideoRepository.getDominantSelectedLanguage(creator._id);
    if (dominantLanguage) {
      creator.personaConfig.language =
        normalizePersonaLanguage(dominantLanguage);
    }

    await embedSelectedCreatorVideos(creator);
    console.log("[worker] Embedding pass complete for selected videos");

    const embeddedChunkCount =
      await transcriptChunkRepository.countEmbeddedByCreator(creator._id);

    try {
      await buildCreatorPersonaProfile(creator);
      console.log("[worker] Persona profile built");
    } catch (profileError) {
      console.warn(
        "[worker] Persona profile build failed:",
        profileError instanceof Error ? profileError.message : profileError,
      );
    }

    await creatorRepository.save(creator);

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
