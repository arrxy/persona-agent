import { YoutubeTranscript } from "youtube-transcript";
import { creatorRequestRepository } from "../repository/CreatorRequestRepository.js";
import { CreatorRequestStatus } from "../enums.js";

export interface TranscriptSegment {
  text: string;
  startSeconds: number;
  durationSeconds: number;
  endSeconds: number;
}

export function extractYoutubeVideoId(input: string): string {
  const trimmed = input.trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  const url = new URL(trimmed);

  if (url.hostname === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id) return id;
  }

  const watchId = url.searchParams.get("v");
  if (watchId) return watchId;

  const parts = url.pathname.split("/").filter(Boolean);
  const shortsIndex = parts.indexOf("shorts");
  const embedIndex = parts.indexOf("embed");

  if (shortsIndex !== -1 && parts[shortsIndex + 1]) {
    return parts[shortsIndex + 1];
  }

  if (embedIndex !== -1 && parts[embedIndex + 1]) {
    return parts[embedIndex + 1];
  }

  throw new Error("Invalid YouTube URL or video ID");
}

function cleanTranscriptText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const TRANSCRIPT_LANG_TRY_ORDER = ["en", "hi", "hi-IN", "en-IN", "en-US"];

export function logTranscriptNetworkConfig(): void {
  console.log("[worker] Transcript fetches use YouTube directly (youtube-transcript)");
}

export async function getYoutubeTranscript(
  input: string,
): Promise<TranscriptSegment[]> {
  const videoId = extractYoutubeVideoId(input);
  let lastError: Error | undefined;

  for (const lang of TRANSCRIPT_LANG_TRY_ORDER) {
    try {
      const rawTranscript = await YoutubeTranscript.fetchTranscript(videoId, {
        lang,
      });
      const segments = rawTranscript
        .map((item) => {
          const startSeconds = Number(item.offset) / 1000;
          const durationSeconds = Number(item.duration) / 1000;

          return {
            text: cleanTranscriptText(item.text),
            startSeconds,
            durationSeconds,
            endSeconds: startSeconds + durationSeconds,
          };
        })
        .filter((segment) => segment.text.length > 0);

      if (segments.length > 0) {
        return segments;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  try {
    const rawTranscript = await YoutubeTranscript.fetchTranscript(videoId);
    const segments = rawTranscript
      .map((item) => {
        const startSeconds = Number(item.offset) / 1000;
        const durationSeconds = Number(item.duration) / 1000;

        return {
          text: cleanTranscriptText(item.text),
          startSeconds,
          durationSeconds,
          endSeconds: startSeconds + durationSeconds,
        };
      })
      .filter((segment) => segment.text.length > 0);

    if (segments.length > 0) {
      return segments;
    }
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
  }

  throw lastError ?? new Error("No transcript available for this video");
}

export async function requestCreator({
  userId,
  channelUrl,
}: {
  userId: string;
  channelUrl: string;
}) {
  const existingRequest =
    await creatorRequestRepository.findExistingActiveRequest({
      userId,
      inputChannelUrl: channelUrl,
    });

  if (
    existingRequest?.status === CreatorRequestStatus.PENDING ||
    existingRequest?.status === CreatorRequestStatus.PROCESSING
  ) {
    return existingRequest;
  } else if (existingRequest) {
    return creatorRequestRepository.reopenForProcessing(existingRequest._id);
  }

  return creatorRequestRepository.create({
    userId,
    inputChannelUrl: channelUrl,
  });
}

export async function requestCreatorReingest({
  userId,
  creatorId,
  channelUrl,
}: {
  userId: string;
  creatorId: string;
  channelUrl: string;
}) {
  const activeReingest =
    await creatorRequestRepository.findActiveReingest(creatorId);

  if (activeReingest) {
    return activeReingest;
  }

  return creatorRequestRepository.create({
    userId,
    inputChannelUrl: channelUrl,
    creatorId,
    reingest: true,
  });
}
