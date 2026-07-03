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
  creatorId?: CreatorSummary | string;
  updatedAt: string;
  createdAt: string;
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

export async function fetchPersonas(): Promise<Persona[]> {
  const result = await apiFetch<{ creators: Persona[] }>("/creators");
  return result.creators;
}

export async function submitCreatorRequest(channelUrl: string): Promise<void> {
  await apiFetch("/youtube/creator-request", {
    method: "POST",
    body: JSON.stringify({ channelUrl }),
  });
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

export async function sendChat(params: {
  creatorId: string;
  message: string;
  conversationId?: string;
}): Promise<{
  conversationId: string;
  reply: string;
  sources: ChatSource[];
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
