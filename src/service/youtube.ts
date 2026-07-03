import { YoutubeTranscript } from "youtube-transcript";
import { ProxyAgent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import { env } from "../config/env.js";
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

function mapRawTranscript(
  rawTranscript: Awaited<ReturnType<typeof YoutubeTranscript.fetchTranscript>>,
): TranscriptSegment[] {
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

const TRANSCRIPT_LANG_TRY_ORDER = ["en", "hi", "hi-IN", "en-IN", "en-US"];

let transcriptProxyFetch:
  | ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>)
  | undefined;

function getTranscriptFetchConfig(): {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
} {
  if (!env.TRANSCRIPT_PROXY_URL) {
    return {};
  }

  if (!transcriptProxyFetch) {
    const agent = new ProxyAgent(env.TRANSCRIPT_PROXY_URL);
    transcriptProxyFetch = (input, init) =>
      undiciFetch(input as string | URL, {
        ...(init as UndiciRequestInit | undefined),
        dispatcher: agent,
      }) as unknown as Promise<Response>;
  }

  return { fetch: transcriptProxyFetch };
}

export function logTranscriptNetworkConfig(): void {
  if (env.TRANSCRIPT_PROXY_URL) {
    console.log("[worker] Transcript fetches use TRANSCRIPT_PROXY_URL");
    return;
  }

  console.warn(
    "[worker] TRANSCRIPT_PROXY_URL not set — YouTube often blocks transcript fetches from cloud/datacenter IPs",
  );
}

export async function getYoutubeTranscript(
  input: string,
): Promise<TranscriptSegment[]> {
  const videoId = extractYoutubeVideoId(input);
  const fetchConfig = getTranscriptFetchConfig();
  let lastError: Error | undefined;

  for (const lang of TRANSCRIPT_LANG_TRY_ORDER) {
    try {
      const rawTranscript = await YoutubeTranscript.fetchTranscript(videoId, {
        lang,
        ...fetchConfig,
      });
      const segments = mapRawTranscript(rawTranscript);
      if (segments.length > 0) {
        return segments;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  try {
    const rawTranscript = await YoutubeTranscript.fetchTranscript(videoId, {
      ...fetchConfig,
    });
    const segments = mapRawTranscript(rawTranscript);
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