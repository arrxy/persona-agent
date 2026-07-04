import type { CreatorRequestSummary } from "./api";

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatFollowers(count?: number): string {
  if (!count) return "";
  if (count >= 1_000_000_000) {
    return `${(count / 1_000_000_000).toFixed(count >= 10_000_000_000 ? 0 : 1)}B`;
  }
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}K`;
  }
  return String(count);
}

export function getPendingPersonaName(request: CreatorRequestSummary): string {
  const creator = request.creatorId;
  if (creator && typeof creator !== "string") {
    if (creator.name?.trim()) return creator.name;
    if (creator.handle?.trim()) return creator.handle;
  }

  const handleMatch = request.inputChannelUrl.match(/@([^/?#]+)/);
  if (handleMatch?.[1]) return handleMatch[1];

  try {
    const hostname = new URL(request.inputChannelUrl).hostname;
    if (hostname.includes("youtube")) return "YouTube channel";
  } catch {
    /* ignore invalid URLs */
  }

  return "New persona";
}

export function getPendingPersonaAvatar(
  request: CreatorRequestSummary,
): string | undefined {
  const creator = request.creatorId;
  if (creator && typeof creator !== "string") {
    return creator.avatarUrl;
  }
  return undefined;
}

export function getCreatorRequestStatusLabel(
  status: CreatorRequestSummary["status"],
): string {
  switch (status) {
    case "pending":
    case "processing":
      return "Requested";
    case "failed":
      return "Failed";
    default:
      return "Requested";
  }
}

export function isActiveCreatorRequest(
  request: CreatorRequestSummary,
): boolean {
  return request.status === "pending" || request.status === "processing";
}

export function formatRelativeTime(date: string | Date): string {
  const then = new Date(date).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}
