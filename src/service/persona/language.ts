import type { TranscriptLanguage } from "../youtube/videoSelection.js";
import { detectTranscriptLanguage } from "../youtube/videoSelection.js";

export type ReplyLanguage = "en" | "hi" | "hinglish";

export function transcriptLanguageToReply(
  language: TranscriptLanguage | string | undefined,
): ReplyLanguage {
  if (language === "hi") return "hi";
  if (language === "mixed") return "hinglish";
  return "en";
}

export function detectReplyLanguageFromText(text: string): ReplyLanguage {
  return transcriptLanguageToReply(detectTranscriptLanguage(text));
}

export function getCreatorReplyLanguage(
  language: TranscriptLanguage | string | undefined,
): ReplyLanguage {
  return transcriptLanguageToReply(language);
}

export function inferReplyLanguage(
  chunks: { language?: string; text: string; score?: number }[],
  fallback: ReplyLanguage = "en",
): ReplyLanguage {
  if (chunks.length === 0) return fallback;

  const weights = new Map<ReplyLanguage, number>();

  for (const chunk of chunks) {
    const lang = chunk.language
      ? transcriptLanguageToReply(chunk.language as TranscriptLanguage)
      : detectReplyLanguageFromText(chunk.text);

    const weight = chunk.score ?? 1;
    weights.set(lang, (weights.get(lang) ?? 0) + weight);
  }

  let best: ReplyLanguage = fallback;
  let bestWeight = -1;

  for (const [lang, weight] of weights) {
    if (weight > bestWeight) {
      best = lang;
      bestWeight = weight;
    }
  }

  return best;
}

const DIALECT_LOCK =
  "Always use the creator's dialect — never switch to match the language the user wrote in.";

const ROMAN_SCRIPT_RULE =
  "NEVER use Devanagari (हिंदी). Always write Hindi words in Roman transliteration (e.g. dekho, khud, mein). Keep English/tech terms in English (HTML, iPhone, camera).";

export function replyLanguageInstruction(language: ReplyLanguage): string {
  switch (language) {
    case "hi":
      return [
        "Reply in Hindi vocabulary and grammar, but exclusively in Roman/Latin script.",
        ROMAN_SCRIPT_RULE,
        'Example: "dekho, HTML khud me bahut simple hai" — NOT "देखो, HTML खुद में".',
        DIALECT_LOCK,
        "Even if the user asks in English or Devanagari Hindi, respond in Romanized Hindi.",
      ].join(" ");
    case "hinglish":
      return [
        "Reply in Hinglish — natural Hindi-English mix in Roman script only.",
        ROMAN_SCRIPT_RULE,
        'Example: "dekho, iPhone 16 ka camera honestly next level hai".',
        DIALECT_LOCK,
        "Even if the user asks in pure English or Devanagari, respond in Roman Hinglish.",
      ].join(" ");
    default:
      return [
        "Reply in English, matching how the creator speaks in English videos.",
        DIALECT_LOCK,
        "Even if the user asks in Hindi or Hinglish, respond in English.",
      ].join(" ");
  }
}
