import type { TranscriptSegment } from "./youtube.js";

export interface TranscriptChunkDraft {
  chunkIndex: number;
  text: string;
  wordCount: number;
  startSeconds: number;
  endSeconds: number;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function chunkTranscriptSegments(
  segments: TranscriptSegment[],
  targetWords = 400,
): TranscriptChunkDraft[] {
  if (segments.length === 0) return [];

  const chunks: TranscriptChunkDraft[] = [];
  let buffer: TranscriptSegment[] = [];
  let bufferWords = 0;

  function flushChunk(): void {
    if (buffer.length === 0) return;

    const text = buffer.map((segment) => segment.text).join(" ").trim();
    if (!text) {
      buffer = [];
      bufferWords = 0;
      return;
    }

    chunks.push({
      chunkIndex: chunks.length,
      text,
      wordCount: countWords(text),
      startSeconds: buffer[0]!.startSeconds,
      endSeconds: buffer.at(-1)!.endSeconds,
    });

    buffer = [];
    bufferWords = 0;
  }

  for (const segment of segments) {
    buffer.push(segment);
    bufferWords += countWords(segment.text);

    if (bufferWords >= targetWords) {
      flushChunk();
    }
  }

  flushChunk();
  return chunks;
}
