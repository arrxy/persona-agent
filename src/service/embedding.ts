import { OpenAI } from "openai";
import { env } from "../config/env.js";

const openai = new OpenAI({ apiKey: env.OPEN_AI_KEY });

const EMBEDDING_BATCH_SIZE = 100;

function requireOpenAiKey(): void {
  if (!env.OPEN_AI_KEY) {
    throw new Error("Missing required environment variable: OPEN_AI_KEY");
  }
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  requireOpenAiKey();

  if (texts.length === 0) return [];

  const vectors: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: env.EMBEDDING_MODEL,
      input: batch,
      dimensions: env.EMBEDDING_DIMENSIONS,
    });

    vectors.push(...response.data.map((item) => item.embedding));
  }

  return vectors;
}
