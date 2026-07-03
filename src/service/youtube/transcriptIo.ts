import { env } from "../../config/env.js";

export interface TranscriptSegment {
  text: string;
  startSeconds: number;
  durationSeconds: number;
  endSeconds: number;
}

const TRANSCRIPT_IO_API_URL =
  "https://www.youtube-transcript.io/api/transcripts";
const TRANSCRIPT_LANG_PREFERENCE = ["en", "hi", "hi-IN", "en-IN", "en-US"];

interface IoTranscriptLine {
  text: string;
  start: string | number;
  dur: string | number;
}

interface IoTrack {
  language?: string;
  languageCode?: string;
  transcript?: IoTranscriptLine[];
}

interface IoVideoTranscript {
  id: string;
  title?: string;
  tracks?: IoTrack[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanTranscriptText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function mapIoTranscript(lines: IoTranscriptLine[]): TranscriptSegment[] {
  return lines
    .map((line) => {
      const startSeconds = Number(line.start);
      const durationSeconds = Number(line.dur);

      return {
        text: cleanTranscriptText(line.text),
        startSeconds,
        durationSeconds,
        endSeconds: startSeconds + durationSeconds,
      };
    })
    .filter((segment) => segment.text.length > 0);
}

function trackMatchesLanguage(track: IoTrack, lang: string): boolean {
  const code = track.languageCode?.toLowerCase();
  const label = track.language?.toLowerCase() ?? "";

  if (code) {
    return code === lang.toLowerCase() || code.startsWith(`${lang.toLowerCase()}-`);
  }

  if (lang.toLowerCase() === "en") {
    return label.includes("english");
  }

  if (lang.toLowerCase() === "hi") {
    return label.includes("hindi");
  }

  return label.includes(lang.toLowerCase());
}

function pickTrack(tracks: IoTrack[]): IoTrack | undefined {
  if (tracks.length === 0) {
    return undefined;
  }

  for (const lang of TRANSCRIPT_LANG_PREFERENCE) {
    const match = tracks.find((track) => trackMatchesLanguage(track, lang));
    if (match?.transcript?.length) {
      return match;
    }
  }

  return tracks.find((track) => track.transcript?.length) ?? tracks[0];
}

async function postTranscripts(
  ids: string[],
  attempt = 1,
): Promise<IoVideoTranscript[]> {
  const token = env.YOUTUBE_TRANSCRIPT_IO_API_TOKEN;
  if (!token) {
    throw new Error("YOUTUBE_TRANSCRIPT_IO_API_TOKEN is not set");
  }

  const response = await fetch(TRANSCRIPT_IO_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids }),
  });

  if (response.status === 429 && attempt <= 3) {
    const retryAfterSeconds = Number(response.headers.get("Retry-After") ?? "10");
    await sleep(Math.max(retryAfterSeconds, 1) * 1000);
    return postTranscripts(ids, attempt + 1);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `youtube-transcript.io API ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  const json: unknown = await response.json();
  return Array.isArray(json) ? (json as IoVideoTranscript[]) : [json as IoVideoTranscript];
}

export function isTranscriptIoConfigured(): boolean {
  return Boolean(env.YOUTUBE_TRANSCRIPT_IO_API_TOKEN?.trim());
}

export async function fetchTranscriptsFromIoApi(
  videoIds: string[],
): Promise<Map<string, TranscriptSegment[]>> {
  const result = new Map<string, TranscriptSegment[]>();
  const uniqueIds = [...new Set(videoIds.filter(Boolean))];

  for (let index = 0; index < uniqueIds.length; index += 50) {
    const batch = uniqueIds.slice(index, index + 50);
    const items = await postTranscripts(batch);

    for (const item of items) {
      const track = pickTrack(item.tracks ?? []);
      result.set(
        item.id,
        track?.transcript?.length ? mapIoTranscript(track.transcript) : [],
      );
    }

    for (const id of batch) {
      if (!result.has(id)) {
        result.set(id, []);
      }
    }
  }

  return result;
}

export async function fetchTranscriptFromIoApi(
  videoId: string,
): Promise<TranscriptSegment[]> {
  const transcripts = await fetchTranscriptsFromIoApi([videoId]);
  const segments = transcripts.get(videoId) ?? [];

  if (segments.length === 0) {
    throw new Error(`No transcript available for video ${videoId}`);
  }

  return segments;
}
