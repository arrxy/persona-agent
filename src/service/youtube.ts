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

function normalizeProxyUrl(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, "");
}

function resolveFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input.startsWith("/")
      ? `https://www.youtube.com${input}`
      : input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  const requestUrl = input.url;
  return requestUrl.startsWith("/")
    ? `https://www.youtube.com${requestUrl}`
    : requestUrl;
}

function assertProxyHostPort(host: string, port: string): void {
  if (host === "host" || port === "port") {
    throw new Error(
      'Proxy host/port still look like placeholders — set TRANSCRIPT_PROXY_HOST and TRANSCRIPT_PROXY_PORT to your provider\'s values (Webshare: p.webshare.io and 80)',
    );
  }

  if (!host.trim()) {
    throw new Error("TRANSCRIPT_PROXY_HOST is empty");
  }

  if (!port.trim() || Number.isNaN(Number(port))) {
    throw new Error(
      `TRANSCRIPT_PROXY_PORT must be numeric (got "${port}") — Webshare residential is usually 80`,
    );
  }
}

function buildProxyUrl(
  user: string,
  pass: string,
  host: string,
  port: string,
): string {
  assertProxyHostPort(host, port);
  return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
}

export function parseTranscriptProxyUrl(raw: string): URL {
  const trimmed = normalizeProxyUrl(raw);

  if (
    trimmed.includes("@host:") ||
    /(?:^|@)host:port(?:$|\/)/i.test(trimmed)
  ) {
    throw new Error(
      'TRANSCRIPT_PROXY_URL still contains placeholder "host:port" — either set only user:pass (we default to Webshare p.webshare.io:80) or use TRANSCRIPT_PROXY_USER + TRANSCRIPT_PROXY_PASS',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      "TRANSCRIPT_PROXY_URL is not a valid URL — use user:pass, http://USER:PASS@host:PORT, or TRANSCRIPT_PROXY_USER + TRANSCRIPT_PROXY_PASS",
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("TRANSCRIPT_PROXY_URL must use http:// or https://");
  }

  if (!parsed.hostname || parsed.hostname === "host") {
    throw new Error("TRANSCRIPT_PROXY_URL is missing a real proxy hostname");
  }

  if (!parsed.port || parsed.port === "port" || Number.isNaN(Number(parsed.port))) {
    throw new Error(
      `TRANSCRIPT_PROXY_URL has invalid port "${parsed.port || "(none)"}" — use a numeric port such as 80 or 8080`,
    );
  }

  return parsed;
}

/** Resolve proxy from TRANSCRIPT_PROXY_URL and/or TRANSCRIPT_PROXY_USER/PASS. */
export function resolveTranscriptProxyUrl(): string | undefined {
  const urlSetting = env.TRANSCRIPT_PROXY_URL?.trim();
  const user = env.TRANSCRIPT_PROXY_USER?.trim();
  const pass = env.TRANSCRIPT_PROXY_PASS;

  if (urlSetting) {
    const trimmed = normalizeProxyUrl(urlSetting);

    if (!trimmed.includes("://") && !trimmed.includes("@")) {
      const colon = trimmed.indexOf(":");
      if (colon <= 0 || colon === trimmed.length - 1) {
        throw new Error(
          "TRANSCRIPT_PROXY_URL shorthand must be user:pass — host/port come from TRANSCRIPT_PROXY_HOST and TRANSCRIPT_PROXY_PORT",
        );
      }

      return buildProxyUrl(
        trimmed.slice(0, colon),
        trimmed.slice(colon + 1),
        env.TRANSCRIPT_PROXY_HOST,
        env.TRANSCRIPT_PROXY_PORT,
      );
    }

    if (!trimmed.includes("://") && trimmed.includes("@")) {
      return parseTranscriptProxyUrl(`http://${trimmed}`).href;
    }

    return parseTranscriptProxyUrl(trimmed).href;
  }

  if (user && pass) {
    return buildProxyUrl(
      user,
      pass,
      env.TRANSCRIPT_PROXY_HOST,
      env.TRANSCRIPT_PROXY_PORT,
    );
  }

  return undefined;
}

function getTranscriptFetchConfig(): {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
} {
  const proxyUrl = resolveTranscriptProxyUrl();
  if (!proxyUrl) {
    return {};
  }

  if (!transcriptProxyFetch) {
    const agent = new ProxyAgent(proxyUrl);
    transcriptProxyFetch = (input, init) => {
      const undiciInit = init as UndiciRequestInit | undefined;

      return undiciFetch(resolveFetchUrl(input), {
        method: undiciInit?.method,
        headers: undiciInit?.headers,
        body: undiciInit?.body,
        dispatcher: agent,
      }) as unknown as Promise<Response>;
    };
  }

  return { fetch: transcriptProxyFetch };
}

export function logTranscriptNetworkConfig(): void {
  const proxyUrl = resolveTranscriptProxyUrl();
  if (!proxyUrl) {
    console.warn(
      "[worker] No transcript proxy configured — YouTube often blocks transcript fetches from cloud/datacenter IPs. Set TRANSCRIPT_PROXY_USER + TRANSCRIPT_PROXY_PASS, or TRANSCRIPT_PROXY_URL=user:pass",
    );
    return;
  }

  const parsed = new URL(proxyUrl);
  console.log(
    `[worker] Transcript fetches use proxy ${parsed.hostname}:${parsed.port}`,
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