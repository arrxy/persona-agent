import { VideoProcessingStatus } from "../../enums.js";
import { env } from "../../config/env.js";
import type { ICreatorDocument } from "../../models/Creator.js";
import type { ICreatorVideoDocument } from "../../models/CreatorVideo.js";
import { creatorVideoRepository } from "../../repository/CreatorVideoRepository.js";
import { transcriptChunkRepository } from "../../repository/TranscriptChunkRepository.js";
import { chunkTranscriptSegments } from "../chunking.js";
import { embedTexts } from "../embedding.js";
import type { TranscriptSegment } from "../youtube.js";
import {
  createPointId,
  upsertChunkPoints,
  type QdrantChunkPoint,
} from "../qdrant/collections.js";

export async function embedVideoTranscript(params: {
  creator: ICreatorDocument;
  video: ICreatorVideoDocument;
  segments: TranscriptSegment[];
}): Promise<number> {
  const { creator, video, segments } = params;
  const creatorId = creator._id.toString();
  const videoId = video._id.toString();
  const drafts = chunkTranscriptSegments(segments, env.CHUNK_TARGET_WORDS);

  if (drafts.length === 0) {
    video.processing = { status: VideoProcessingStatus.EMBEDDED };
    await creatorVideoRepository.save(video);
    return 0;
  }

  await transcriptChunkRepository.deleteByVideoId(video._id);

  const vectors = await embedTexts(drafts.map((draft) => draft.text));
  const language =
    video.transcript?.language ?? creator.personaConfig?.language ?? "en";
  const points: QdrantChunkPoint[] = [];
  const chunkDocs = [];

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!;
    const vector = vectors[i]!;
    const pointId = createPointId();

    points.push({
      pointId,
      vector,
      payload: {
        creatorId,
        videoId,
        youtubeVideoId: video.youtubeVideoId,
        chunkIndex: draft.chunkIndex,
        text: draft.text,
        startSeconds: draft.startSeconds,
        endSeconds: draft.endSeconds,
        videoTitle: video.title,
        videoUrl: video.url,
        publishedAt: video.publishedAt?.toISOString(),
        language,
      },
    });

    chunkDocs.push({
      creatorId: creator._id,
      videoId: video._id,
      youtubeVideoId: video.youtubeVideoId,
      chunkIndex: draft.chunkIndex,
      text: draft.text,
      tokenCount: draft.wordCount,
      startSeconds: draft.startSeconds,
      endSeconds: draft.endSeconds,
      source: {
        videoTitle: video.title,
        videoUrl: video.url,
        publishedAt: video.publishedAt,
      },
      metadata: { language, topics: [], entities: [] },
      quality: { hasGoodSignal: true },
    });
  }

  video.processing = { status: VideoProcessingStatus.CHUNKED };
  await creatorVideoRepository.save(video);

  const insertedChunks = await transcriptChunkRepository.insertMany(chunkDocs);
  const collectionName = await upsertChunkPoints(creatorId, points);
  const indexedAt = new Date();

  await Promise.all(
    insertedChunks.map((chunk, index) =>
      transcriptChunkRepository.updateQdrantMetadata(chunk._id, {
        collectionName,
        pointId: points[index]!.pointId,
        vectorModel: env.EMBEDDING_MODEL,
        indexedAt,
      }),
    ),
  );

  video.processing = { status: VideoProcessingStatus.EMBEDDED };
  await creatorVideoRepository.save(video);

  return drafts.length;
}

export async function embedSelectedCreatorVideos(
  creator: ICreatorDocument,
): Promise<number> {
  const { getYoutubeTranscript } = await import("../youtube.js");

  const videos = await creatorVideoRepository.findReadyForEmbedding(
    creator._id,
  );

  let totalChunks = 0;

  for (const video of videos) {
    const segments = await getYoutubeTranscript(video.youtubeVideoId);
    totalChunks += await embedVideoTranscript({ creator, video, segments });
  }

  return totalChunks;
}
