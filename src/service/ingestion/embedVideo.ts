import { VideoProcessingStatus } from "../../enums.js";
import { env } from "../../config/env.js";
import type { ICreatorDocument } from "../../models/Creator.js";
import type { ICreatorVideoDocument } from "../../models/CreatorVideo.js";
import { TranscriptChunk } from "../../models/TranscriptChunk.js";
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
    await video.save();
    return 0;
  }

  await TranscriptChunk.deleteMany({ videoId: video._id });

  const vectors = await embedTexts(drafts.map((draft) => draft.text));
  const language = creator.personaConfig?.language ?? "en";
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
  await video.save();

  const insertedChunks = await TranscriptChunk.insertMany(chunkDocs);
  const collectionName = await upsertChunkPoints(creatorId, points);
  const indexedAt = new Date();

  await Promise.all(
    insertedChunks.map((chunk, index) =>
      TranscriptChunk.findByIdAndUpdate(chunk._id, {
        $set: {
          qdrant: {
            collectionName,
            pointId: points[index]!.pointId,
            vectorModel: env.EMBEDDING_MODEL,
            indexedAt,
          },
        },
      }),
    ),
  );

  video.processing = { status: VideoProcessingStatus.EMBEDDED };
  await video.save();

  return drafts.length;
}

export async function embedSelectedCreatorVideos(
  creator: ICreatorDocument,
): Promise<number> {
  const { CreatorVideo } = await import("../../models/CreatorVideo.js");
  const { getYoutubeTranscript } = await import("../youtube.js");

  const videos = await CreatorVideo.find({
    creatorId: creator._id,
    "selection.selectedForPersona": true,
    "transcript.available": true,
    "processing.status": VideoProcessingStatus.TRANSCRIPT_FETCHED,
  });

  let totalChunks = 0;

  for (const video of videos) {
    const segments = await getYoutubeTranscript(video.youtubeVideoId);
    totalChunks += await embedVideoTranscript({ creator, video, segments });
  }

  return totalChunks;
}
