import { env } from "../../config/env.js";

export interface ResolvedChannel {
  channelId: string;
  channelUrl: string;
  handle?: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  uploadsPlaylistId: string;
  stats?: {
    subscriberCount?: number;
    videoCount?: number;
    totalViewCount?: number;
  };
}

export interface ChannelVideo {
  youtubeVideoId: string;
  channelId: string;
  url: string;
  title: string;
  description?: string;
  publishedAt?: Date;
  durationSeconds: number;
  stats?: {
    viewCount?: number;
    likeCount?: number;
    commentCount?: number;
  };
}

interface YoutubeApiResponse {
  items?: Record<string, unknown>[];
  nextPageToken?: string;
}

function requireApiKey(): string {
  if (!env.YOUTUBE_API_KEY) {
    throw new Error("Missing required environment variable: YOUTUBE_API_KEY");
  }
  return env.YOUTUBE_API_KEY;
}

async function youtubeGet(
  endpoint: string,
  params: Record<string, string>,
): Promise<YoutubeApiResponse> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  url.searchParams.set("key", requireApiKey());

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YouTube API error (${response.status}): ${body}`);
  }

  return response.json() as Promise<YoutubeApiResponse>;
}

function parseIso8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);

  return hours * 3600 + minutes * 60 + seconds;
}

function buildChannelUrl(channelId: string, handle?: string): string {
  if (handle) {
    return `https://www.youtube.com/@${handle}`;
  }
  return `https://www.youtube.com/channel/${channelId}`;
}

function parseChannelInput(input: string): {
  type: "handle" | "id" | "search";
  value: string;
} {
  const trimmed = input.trim();

  if (/^UC[\w-]{22}$/.test(trimmed)) {
    return { type: "id", value: trimmed };
  }

  if (trimmed.startsWith("@")) {
    return { type: "handle", value: trimmed.slice(1) };
  }

  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    );
    const parts = url.pathname.split("/").filter(Boolean);

    const handlePart = parts.find((part) => part.startsWith("@"));
    if (handlePart) {
      return { type: "handle", value: handlePart.slice(1) };
    }

    const channelIndex = parts.indexOf("channel");
    if (channelIndex !== -1 && parts[channelIndex + 1]) {
      return { type: "id", value: parts[channelIndex + 1]! };
    }

    const customIndex = parts.indexOf("c");
    if (customIndex !== -1 && parts[customIndex + 1]) {
      return { type: "search", value: parts[customIndex + 1]! };
    }

    const userIndex = parts.indexOf("user");
    if (userIndex !== -1 && parts[userIndex + 1]) {
      return { type: "search", value: parts[userIndex + 1]! };
    }
  } catch {
    if (/^[\w.-]+$/.test(trimmed)) {
      return { type: "search", value: trimmed };
    }
  }

  throw new Error("Invalid YouTube channel URL");
}

function mapChannelItem(item: Record<string, unknown>): ResolvedChannel {
  const snippet = item.snippet as Record<string, unknown>;
  const statistics = item.statistics as Record<string, string> | undefined;
  const contentDetails = item.contentDetails as
    | Record<string, Record<string, string>>
    | undefined;
  const thumbnails = snippet.thumbnails as
    | Record<string, { url?: string }>
    | undefined;

  const channelId = item.id as string;
  const customUrl = snippet.customUrl as string | undefined;
  const handle = customUrl?.startsWith("@")
    ? customUrl.slice(1)
    : customUrl?.replace(/^@/, "");

  const uploadsPlaylistId =
    contentDetails?.relatedPlaylists?.uploads ??
    `UU${channelId.slice(2)}`;

  return {
    channelId,
    channelUrl: buildChannelUrl(channelId, handle),
    handle,
    name: snippet.title as string,
    description: snippet.description as string | undefined,
    avatarUrl: thumbnails?.high?.url ?? thumbnails?.default?.url,
    bannerUrl: (snippet as { bannerExternalUrl?: string }).bannerExternalUrl,
    uploadsPlaylistId,
    stats: statistics
      ? {
          subscriberCount: Number(statistics.subscriberCount ?? 0),
          videoCount: Number(statistics.videoCount ?? 0),
          totalViewCount: Number(statistics.viewCount ?? 0),
        }
      : undefined,
  };
}

async function fetchChannelById(channelId: string): Promise<ResolvedChannel> {
  const data = await youtubeGet("channels", {
    part: "snippet,statistics,contentDetails,brandingSettings",
    id: channelId,
  });

  const item = data.items?.[0];
  if (!item) {
    throw new Error(`YouTube channel not found: ${channelId}`);
  }

  return mapChannelItem(item);
}

async function fetchChannelByHandle(handle: string): Promise<ResolvedChannel> {
  const data = await youtubeGet("channels", {
    part: "snippet,statistics,contentDetails,brandingSettings",
    forHandle: handle,
  });

  const item = data.items?.[0];
  if (!item) {
    throw new Error(`YouTube channel not found for handle: @${handle}`);
  }

  return mapChannelItem(item);
}

async function searchChannel(query: string): Promise<ResolvedChannel> {
  const data = await youtubeGet("search", {
    part: "snippet",
    type: "channel",
    maxResults: "1",
    q: query,
  });

  const item = data.items?.[0];
  if (!item) {
    throw new Error(`YouTube channel not found for query: ${query}`);
  }

  const channelId = (item.id as { channelId?: string }).channelId;
  if (!channelId) {
    throw new Error(`YouTube channel search returned no channelId for: ${query}`);
  }

  return fetchChannelById(channelId);
}

export async function resolveChannel(
  channelUrl: string,
): Promise<ResolvedChannel> {
  const parsed = parseChannelInput(channelUrl);

  switch (parsed.type) {
    case "id":
      return fetchChannelById(parsed.value);
    case "handle":
      return fetchChannelByHandle(parsed.value);
    case "search":
      return searchChannel(parsed.value);
  }
}

function mapVideoItem(
  item: Record<string, unknown>,
  normalizedChannelId: string,
): ChannelVideo | null {
  const snippet = item.snippet as Record<string, unknown>;
  const contentDetails = item.contentDetails as Record<string, string>;
  const statistics = item.statistics as Record<string, string> | undefined;
  const videoChannelId = snippet.channelId as string;

  if (videoChannelId !== normalizedChannelId) {
    return null;
  }

  const youtubeVideoId = item.id as string;

  return {
    youtubeVideoId,
    channelId: videoChannelId,
    url: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
    title: snippet.title as string,
    description: snippet.description as string | undefined,
    publishedAt: snippet.publishedAt
      ? new Date(snippet.publishedAt as string)
      : undefined,
    durationSeconds: parseIso8601Duration(contentDetails.duration),
    stats: statistics
      ? {
          viewCount: Number(statistics.viewCount ?? 0),
          likeCount: Number(statistics.likeCount ?? 0),
          commentCount: Number(statistics.commentCount ?? 0),
        }
      : undefined,
  };
}

async function fetchVideoDetails(
  videoIds: string[],
  normalizedChannelId: string,
): Promise<ChannelVideo[]> {
  if (videoIds.length === 0) return [];

  const data = await youtubeGet("videos", {
    part: "snippet,contentDetails,statistics",
    id: videoIds.join(","),
  });

  const videos: ChannelVideo[] = [];

  for (const item of data.items ?? []) {
    const mapped = mapVideoItem(item, normalizedChannelId);
    if (mapped) {
      videos.push(mapped);
    }
  }

  return videos;
}

export async function listChannelUploads(
  uploadsPlaylistId: string,
  normalizedChannelId: string,
  limit = 100,
): Promise<ChannelVideo[]> {
  const videoIds: string[] = [];
  let pageToken: string | undefined;

  while (videoIds.length < limit) {
    const params: Record<string, string> = {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: String(Math.min(50, limit - videoIds.length)),
    };

    if (pageToken) {
      params.pageToken = pageToken;
    }

    const data = await youtubeGet("playlistItems", params);

    for (const item of data.items ?? []) {
      const contentDetails = item.contentDetails as Record<string, string>;
      const videoId = contentDetails.videoId;
      if (videoId) {
        videoIds.push(videoId);
      }
    }

    pageToken = data.nextPageToken;
    if (!pageToken || videoIds.length >= limit) {
      break;
    }
  }

  const videos: ChannelVideo[] = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const batchVideos = await fetchVideoDetails(batch, normalizedChannelId);
    videos.push(...batchVideos);
  }

  return videos;
}
