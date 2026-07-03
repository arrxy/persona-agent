import { IngestionStrategy } from "../../enums.js";
import type { ChannelVideo } from "./channel.js";

const PRESENCE_THRESHOLD = 0.4;
const TRANSCRIPT_CANDIDATE_LIMIT = 30;

const EN_FIRST_PERSON =
  /\b(i|i'm|i've|i'll|we|we're|we've|my|mine|our|ours|us)\b/gi;

const HI_FIRST_PERSON =
  /(?:मैं|मेरे|मेरा|मेरी|मुझे|हम|हमारे|हमारा|हमारी|हमें)/g;

export type TranscriptLanguage = "en" | "hi" | "mixed";

export interface VideoSelectionInput {
  video: ChannelVideo;
  creatorName: string;
  handle?: string;
  transcriptText?: string;
  language?: TranscriptLanguage;
}

export interface VideoSelectionResult {
  selectedForPersona: boolean;
  rankScore: number;
  reason?: string;
  detectedLanguage: TranscriptLanguage;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function detectTranscriptLanguage(text: string): TranscriptLanguage {
  const devanagari = (text.match(/[\u0900-\u097F]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  const total = devanagari + latin;

  if (total === 0) return "en";
  if (devanagari / total >= 0.4) return "hi";
  if (devanagari / total <= 0.1) return "en";
  return "mixed";
}

function countNameMentions(
  text: string,
  creatorName: string,
  handle?: string,
): number {
  const normalized = text.toLowerCase();
  const nameParts = creatorName
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length > 2 && /^[a-z0-9@._-]+$/i.test(part));

  let mentions = 0;

  for (const part of nameParts) {
    const regex = new RegExp(`\\b${escapeRegex(part)}\\b`, "gi");
    mentions += normalized.match(regex)?.length ?? 0;
  }

  if (handle) {
    const handleRegex = new RegExp(
      `\\b@?${escapeRegex(handle.toLowerCase())}\\b`,
      "gi",
    );
    mentions += normalized.match(handleRegex)?.length ?? 0;

    const handleParts = handle
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length > 2);

    for (const part of handleParts) {
      const regex = new RegExp(`\\b${escapeRegex(part)}\\b`, "gi");
      mentions += normalized.match(regex)?.length ?? 0;
    }
  }

  return mentions;
}

function countFirstPersonMentions(text: string): number {
  const englishText = text.toLowerCase();
  const englishMatches = englishText.match(EN_FIRST_PERSON)?.length ?? 0;
  const hindiMatches = text.match(HI_FIRST_PERSON)?.length ?? 0;
  return englishMatches + hindiMatches;
}

function getScoreWeights(language: TranscriptLanguage): {
  nameWeight: number;
  firstPersonWeight: number;
} {
  if (language === "hi") {
    return { nameWeight: 0.2, firstPersonWeight: 0.8 };
  }

  return { nameWeight: 0.6, firstPersonWeight: 0.4 };
}

export function scoreCreatorPresence(
  input: VideoSelectionInput,
): VideoSelectionResult {
  const transcriptText = input.transcriptText?.trim();

  if (!transcriptText) {
    return {
      selectedForPersona: false,
      rankScore: 0,
      reason: "no_transcript",
      detectedLanguage: "en",
    };
  }

  const detectedLanguage =
    input.language ?? detectTranscriptLanguage(transcriptText);
  const wordCount = transcriptText.split(/\s+/).filter(Boolean).length;

  if (wordCount === 0) {
    return {
      selectedForPersona: false,
      rankScore: 0,
      reason: "no_transcript",
      detectedLanguage,
    };
  }

  const nameMentions = countNameMentions(
    transcriptText,
    input.creatorName,
    input.handle,
  );
  const nameScore = Math.min(nameMentions / 5, 1);

  const firstPersonMentions = countFirstPersonMentions(transcriptText);
  const firstPersonScore = Math.min(
    firstPersonMentions / Math.max(wordCount * 0.02, 1),
    1,
  );

  const { nameWeight, firstPersonWeight } = getScoreWeights(detectedLanguage);
  const rankScore = nameScore * nameWeight + firstPersonScore * firstPersonWeight;

  if (rankScore >= PRESENCE_THRESHOLD) {
    return { selectedForPersona: true, rankScore, detectedLanguage };
  }

  return {
    selectedForPersona: false,
    rankScore,
    reason: "low_creator_presence",
    detectedLanguage,
  };
}

export function rankVideosByStrategy(
  videos: ChannelVideo[],
  strategy: IngestionStrategy,
): ChannelVideo[] {
  const ranked = [...videos];

  switch (strategy) {
    case IngestionStrategy.RECENT:
      ranked.sort((a, b) => {
        const aTime = a.publishedAt?.getTime() ?? 0;
        const bTime = b.publishedAt?.getTime() ?? 0;
        return bTime - aTime;
      });
      break;
    case IngestionStrategy.MANUAL:
      break;
    case IngestionStrategy.TOP_VIEWS_LONGEST:
    default:
      ranked.sort((a, b) => {
        const viewDiff =
          (b.stats?.viewCount ?? 0) - (a.stats?.viewCount ?? 0);
        if (viewDiff !== 0) return viewDiff;
        return b.durationSeconds - a.durationSeconds;
      });
      break;
  }

  return ranked;
}

export function getTranscriptCandidateVideos(
  videos: ChannelVideo[],
  strategy: IngestionStrategy,
  limit = TRANSCRIPT_CANDIDATE_LIMIT,
): ChannelVideo[] {
  return rankVideosByStrategy(videos, strategy).slice(0, limit);
}

export const FALLBACK_SELECT_LIMIT = 10;

export async function selectFallbackVideos(params: {
  creatorId: string;
  limit?: number;
}): Promise<number> {
  const { CreatorVideo } = await import("../../models/CreatorVideo.js");

  const limit = params.limit ?? FALLBACK_SELECT_LIMIT;
  const videos = await CreatorVideo.find({
    creatorId: params.creatorId,
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
