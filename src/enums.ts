export enum AuthProvider {
  LOCAL = "local",
  GOOGLE = "google",
}

export enum ChunkContentType {
  TUTORIAL = "tutorial",
  STORY = "story",
  OPINION = "opinion",
  REVIEW = "review",
  INTERVIEW = "interview",
  RANT = "rant",
  GENERAL = "general",
}

export enum ChunkSentiment {
  POSITIVE = "positive",
  NEUTRAL = "neutral",
  NEGATIVE = "negative",
}

export enum ConversationMode {
  CHAT = "chat",
  ASK_WITH_SOURCES = "ask_with_sources",
  ROLEPLAY = "roleplay",
  COACH = "coach",
}

export enum CreatorRequestStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export enum CreatorSource {
  YOUTUBE = "youtube",
}

export enum ImpersonationRisk {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export enum IngestionStrategy {
  TOP_VIEWS_LONGEST = "top_views_longest",
  RECENT = "recent",
  MANUAL = "manual",
}

export enum MessageRole {
  USER = "user",
  ASSISTANT = "assistant",
  SYSTEM = "system",
}

export enum PersonaMode {
  INSPIRED_BY = "inspired_by",
  STYLE_SIMULATION = "style_simulation",
  QUOTE_WITH_CITATIONS = "quote_with_citations",
}

export enum PersonaStatus {
  NOT_STARTED = "not_started",
  QUEUED = "queued",
  PROCESSING = "processing",
  READY = "ready",
  FAILED = "failed",
  STALE = "stale",
}

export enum TranscriptSource {
  YOUTUBE = "youtube",
  THIRD_PARTY = "third_party",
  MANUAL = "manual",
}

export enum VideoProcessingStatus {
  PENDING = "pending",
  TRANSCRIPT_FETCHED = "transcript_fetched",
  CHUNKED = "chunked",
  EMBEDDED = "embedded",
  FAILED = "failed",
}

export enum UserMemoryCategory {
  PREFERENCE = "preference",
  CONTEXT = "context",
  PLAN = "plan",
  RELATIONSHIP = "relationship",
}
