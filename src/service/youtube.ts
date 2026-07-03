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

export async function getYoutubeTranscript(
  input: string,
): Promise<TranscriptSegment[]> {
  const videoId = extractYoutubeVideoId(input);

  const rawTranscript = await YoutubeTranscript.fetchTranscript(videoId);

  return rawTranscript
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
    .filter((segment: TranscriptSegment) => segment.text.length > 0);
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
  
    if (existingRequest?.status === CreatorRequestStatus.PENDING || existingRequest?.status === CreatorRequestStatus.PROCESSING) {
      return existingRequest;
    } else if (existingRequest) {
      return creatorRequestRepository.reopenForProcessing(existingRequest._id);
    }
  
    return creatorRequestRepository.create({
      userId,
      inputChannelUrl: channelUrl,
    });
  }