import { OpenAI } from "openai";
import { env } from "../../config/env.js";
import type { ICreatorDocument } from "../../models/Creator.js";
import {
  creatorPersonaProfileRepository,
  type CreatorPersonaProfileRecord,
} from "../../repository/CreatorPersonaProfileRepository.js";
import { creatorVideoRepository } from "../../repository/CreatorVideoRepository.js";
import { transcriptChunkRepository } from "../../repository/TranscriptChunkRepository.js";

const openai = new OpenAI({ apiKey: env.OPEN_AI_KEY });

const PROFILE_SAMPLE_CHUNKS = 24;
const PROFILE_SAMPLE_CHARS = 12_000;

interface ProfileExtraction {
  summary?: string;
  speakingStyle?: {
    tone?: string[];
    pacing?: string;
    vocabulary?: string[];
    humorStyle?: string;
    commonPhrases?: string[];
    rhetoricalPatterns?: string[];
  };
  beliefsAndOpinions?: {
    topic: string;
    stance: string;
    confidence?: number;
  }[];
  interests?: {
    topic: string;
    weight?: number;
  }[];
  doAndDont?: {
    shouldDo?: string[];
    shouldAvoid?: string[];
  };
}

function requireOpenAiKey(): void {
  if (!env.OPEN_AI_KEY) {
    throw new Error("Missing required environment variable: OPEN_AI_KEY");
  }
}

type StoredPersonaProfile = CreatorPersonaProfileRecord;

function formatProfileForPrompt(profile: StoredPersonaProfile | null): string {
  if (!profile) return "";

  const lines: string[] = [];

  if (profile.summary?.trim()) {
    lines.push(profile.summary.trim());
  }

  const style = profile.speakingStyle;
  if (style.tone.length > 0) {
    lines.push(`Tone: ${style.tone.join(", ")}.`);
  }
  if (style.pacing?.trim()) {
    lines.push(`Pacing: ${style.pacing.trim()}.`);
  }
  if (style.vocabulary.length > 0) {
    lines.push(`Vocabulary: ${style.vocabulary.slice(0, 8).join(", ")}.`);
  }
  if (style.humorStyle?.trim()) {
    lines.push(`Humor: ${style.humorStyle.trim()}.`);
  }
  if (style.commonPhrases.length > 0) {
    lines.push(
      `Common phrases: ${style.commonPhrases.slice(0, 6).map((p) => `"${p}"`).join(", ")}.`,
    );
  }

  const beliefs = profile.beliefsAndOpinions.slice(0, 8);
  if (beliefs.length > 0) {
    lines.push(
      "Recurring opinions:",
      ...beliefs.map((b) => `- ${b.topic}: ${b.stance}`),
    );
  }

  const interests = profile.interests.slice(0, 6);
  if (interests.length > 0) {
    lines.push(
      "Core topics:",
      ...interests.map((i) => `- ${i.topic}`),
    );
  }

  if (profile.doAndDont.shouldDo.length > 0) {
    lines.push(`Do: ${profile.doAndDont.shouldDo.slice(0, 5).join("; ")}.`);
  }
  if (profile.doAndDont.shouldAvoid.length > 0) {
    lines.push(
      `Avoid: ${profile.doAndDont.shouldAvoid.slice(0, 5).join("; ")}.`,
    );
  }

  if (lines.length === 0) return "";

  return `PERSONA PROFILE (synthesized from ${profile.generatedFrom.transcriptHours.toFixed(1)}h of videos):\n${lines.join("\n")}`;
}

export async function loadCreatorPersonaProfile(creatorId: string) {
  return creatorPersonaProfileRepository.findLatestByCreatorId(creatorId);
}

export async function getPersonaProfilePromptBlock(
  creatorId: string,
): Promise<string> {
  const profile = await loadCreatorPersonaProfile(creatorId);
  return formatProfileForPrompt(profile);
}

export async function buildCreatorPersonaProfile(
  creator: ICreatorDocument,
): Promise<void> {
  requireOpenAiKey();

  const selectedVideos =
    await creatorVideoRepository.findSelectedWithTranscriptForPersona(
      creator._id,
    );

  if (selectedVideos.length === 0) return;

  const videoIds = selectedVideos.map((video) => video._id);
  const chunks = await transcriptChunkRepository.findProfileSampleChunks(
    creator._id,
    videoIds,
    PROFILE_SAMPLE_CHUNKS,
  );

  if (chunks.length === 0) return;

  let sampleText = "";
  for (const chunk of chunks) {
    const video = selectedVideos.find(
      (item) => item._id.toString() === chunk.videoId.toString(),
    );
    const line = `[${video?.title ?? "Video"}] ${chunk.text}\n`;
    if (sampleText.length + line.length > PROFILE_SAMPLE_CHARS) break;
    sampleText += line;
  }

  const transcriptSeconds =
    await creatorVideoRepository.sumSelectedTranscriptSeconds(creator._id);

  const response = await openai.chat.completions.create({
    model: env.CHAT_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You analyze YouTube transcript excerpts and build a compact persona profile for ${creator.name}.
Return JSON:
{
  "summary": "2-3 sentences on who they are and how they talk",
  "speakingStyle": {
    "tone": string[],
    "pacing": string,
    "vocabulary": string[],
    "humorStyle": string,
    "commonPhrases": string[],
    "rhetoricalPatterns": string[]
  },
  "beliefsAndOpinions": [{ "topic": string, "stance": string, "confidence": 0-1 }],
  "interests": [{ "topic": string, "weight": 0-1 }],
  "doAndDont": { "shouldDo": string[], "shouldAvoid": string[] }
}
Ground everything in the excerpts. Keep lists short and specific.`,
      },
      {
        role: "user",
        content: sampleText,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) return;

  let parsed: ProfileExtraction;
  try {
    parsed = JSON.parse(raw) as ProfileExtraction;
  } catch {
    return;
  }

  const latestVersion =
    await creatorPersonaProfileRepository.getLatestVersion(creator._id);

  await creatorPersonaProfileRepository.upsert({
    creatorId: creator._id,
    version: latestVersion + 1,
    summary: parsed.summary,
    speakingStyle: {
      tone: parsed.speakingStyle?.tone ?? [],
      pacing: parsed.speakingStyle?.pacing,
      vocabulary: parsed.speakingStyle?.vocabulary ?? [],
      humorStyle: parsed.speakingStyle?.humorStyle,
      commonPhrases: parsed.speakingStyle?.commonPhrases ?? [],
      rhetoricalPatterns: parsed.speakingStyle?.rhetoricalPatterns ?? [],
    },
    beliefsAndOpinions: (parsed.beliefsAndOpinions ?? []).map((item) => ({
      topic: item.topic,
      stance: item.stance,
      confidence: item.confidence ?? 0.5,
      evidenceChunkIds: [],
    })),
    interests: (parsed.interests ?? []).map((item) => ({
      topic: item.topic,
      weight: item.weight ?? 0.5,
      evidenceChunkIds: [],
    })),
    doAndDont: {
      shouldDo: parsed.doAndDont?.shouldDo ?? [],
      shouldAvoid: parsed.doAndDont?.shouldAvoid ?? [],
    },
    generatedFrom: {
      videoIds,
      chunkCount: chunks.length,
      transcriptHours: transcriptSeconds / 3600,
    },
  });
}
