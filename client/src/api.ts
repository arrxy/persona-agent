const API = "/api/v1";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Persona {
  id: string;
  name: string;
  handle?: string;
  description?: string;
  avatarUrl?: string;
  channelUrl?: string;
  subscriberCount?: number;
  selectedVideoCount?: number;
  personaStatus?: string;
  isPinned?: boolean;
  pinnedOrder?: number;
}

export interface PersonasResponse {
  pinned: Persona[];
  creators: Persona[];
}

export type CreatorRequestStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface CreatorRequestSummary {
  _id: string;
  inputChannelUrl: string;
  status: CreatorRequestStatus;
  message?: string;
  error?: { code?: string; message: string };
  creatorId?:
    | {
        _id: string;
        name?: string;
        handle?: string;
        avatarUrl?: string;
        personaStatus?: string;
      }
    | string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorSummary {
  _id: string;
  name: string;
  handle?: string;
  avatarUrl?: string;
}

export interface ConversationSummary {
  _id: string;
  title?: string;
  mode?: ChatMode;
  creatorId?: CreatorSummary | string;
  updatedAt: string;
  createdAt: string;
}

export type ChatMode = "chat" | "sarcastic";

export function normalizeChatMode(mode?: string): ChatMode {
  return mode === "sarcastic" ? "sarcastic" : "chat";
}

export interface StoredMessage {
  _id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatSource {
  type: "transcript" | "memory";
  text: string;
  videoTitle?: string;
  videoUrl?: string;
  score: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
}

function getTokens(): AuthTokens | null {
  const raw = localStorage.getItem("tokens");
  return raw ? (JSON.parse(raw) as AuthTokens) : null;
}

function saveTokens(tokens: AuthTokens): void {
  localStorage.setItem("tokens", JSON.stringify(tokens));
}

export class AuthError extends Error {
  constructor(message = "Session expired") {
    super(message);
    this.name = "AuthError";
  }
}

type AuthExpiredListener = () => void;
const authExpiredListeners = new Set<AuthExpiredListener>();

export function onAuthExpired(listener: AuthExpiredListener): () => void {
  authExpiredListeners.add(listener);
  return () => authExpiredListeners.delete(listener);
}

function notifyAuthExpired(): void {
  clearAuth();
  for (const listener of authExpiredListeners) {
    listener();
  }
}

const AUTH_NO_REFRESH_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/google",
  "/auth/refresh",
];

function shouldAttemptRefresh(path: string): boolean {
  return !AUTH_NO_REFRESH_PATHS.some((authPath) => path.startsWith(authPath));
}

let refreshPromise: Promise<AuthTokens | null> | null = null;

async function refreshTokens(): Promise<AuthTokens | null> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) return null;

  try {
    const response = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return null;

    const nextTokens = data.tokens as AuthTokens;
    if (!nextTokens?.accessToken || !nextTokens?.refreshToken) return null;

    saveTokens(nextTokens);
    return nextTokens;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  localStorage.removeItem("tokens");
  localStorage.removeItem("user");
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem("user");
  return raw ? (JSON.parse(raw) as User) : null;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const tokens = getTokens();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (tokens?.accessToken) {
    headers.Authorization = `Bearer ${tokens.accessToken}`;
  }

  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && shouldAttemptRefresh(path)) {
      if (!retried && tokens?.refreshToken) {
        refreshPromise ??= refreshTokens().finally(() => {
          refreshPromise = null;
        });
        const nextTokens = await refreshPromise;
        if (nextTokens) {
          return apiFetch<T>(path, options, true);
        }
      }

      notifyAuthExpired();
      throw new AuthError();
    }

    throw new Error(data.error ?? `Request failed (${response.status})`);
  }

  return data as T;
}

export async function fetchAuthConfig(): Promise<{ googleClientId: string }> {
  return apiFetch("/auth/config");
}

export async function loginWithGoogle(
  idToken: string,
): Promise<{ user: User; tokens: AuthTokens }> {
  const result = await apiFetch<{ user: User; tokens: AuthTokens }>(
    "/auth/google",
    {
      method: "POST",
      body: JSON.stringify({ idToken }),
    },
  );
  localStorage.setItem("tokens", JSON.stringify(result.tokens));
  localStorage.setItem("user", JSON.stringify(result.user));
  return result;
}

export async function login(
  email: string,
  password: string,
): Promise<{ user: User; tokens: AuthTokens }> {
  const result = await apiFetch<{ user: User; tokens: AuthTokens }>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
  );
  localStorage.setItem("tokens", JSON.stringify(result.tokens));
  localStorage.setItem("user", JSON.stringify(result.user));
  return result;
}

export async function register(
  name: string,
  email: string,
  password: string,
): Promise<{ user: User; tokens: AuthTokens }> {
  const result = await apiFetch<{ user: User; tokens: AuthTokens }>(
    "/auth/register",
    {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    },
  );
  localStorage.setItem("tokens", JSON.stringify(result.tokens));
  localStorage.setItem("user", JSON.stringify(result.user));
  return result;
}

export async function fetchPersonas(): Promise<PersonasResponse> {
  return apiFetch("/creators");
}

export async function fetchCreatorRequests(): Promise<CreatorRequestSummary[]> {
  const result = await apiFetch<{ creatorRequests: CreatorRequestSummary[] }>(
    "/youtube/creator-requests",
  );
  return result.creatorRequests;
}

export async function submitCreatorRequest(
  channelUrl: string,
): Promise<CreatorRequestSummary> {
  const result = await apiFetch<{ creatorRequest: CreatorRequestSummary }>(
    "/youtube/creator-request",
    {
      method: "POST",
      body: JSON.stringify({ channelUrl }),
    },
  );
  return result.creatorRequest;
}

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const result = await apiFetch<{ conversations: ConversationSummary[] }>(
    "/persona/conversations",
  );
  return result.conversations;
}

export async function fetchConversationMessages(
  conversationId: string,
): Promise<{
  conversation: ConversationSummary;
  messages: StoredMessage[];
}> {
  return apiFetch(`/persona/conversations/${conversationId}/messages`);
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await apiFetch(`/persona/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

export async function sendChat(params: {
  creatorId: string;
  message: string;
  conversationId?: string;
  mode?: ChatMode;
}): Promise<{
  conversationId: string;
  reply: string;
  sources: ChatSource[];
  mode: ChatMode;
}> {
  return apiFetch("/persona/chat", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function getCreatorIdFromConversation(
  conversation: ConversationSummary,
): string | null {
  if (!conversation.creatorId) return null;
  if (typeof conversation.creatorId === "string") return conversation.creatorId;
  return conversation.creatorId._id;
}

export function getCreatorNameFromConversation(
  conversation: ConversationSummary,
): string {
  if (conversation.creatorId && typeof conversation.creatorId !== "string") {
    return conversation.creatorId.name;
  }
  return "Persona";
}
