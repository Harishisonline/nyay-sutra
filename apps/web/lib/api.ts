import type {
  ApiError,
  ChatDetail,
  ChatSummary,
  ChatUpdate,
  Diagnostic,
  Draft,
  DraftCreate,
  DraftUpdate,
  DraftVersion,
  ImproveRequest,
  Language,
  NotificationPrefs,
  PrivacyPrefs,
  ProfileUpdate,
  QueryRequest,
  QueryResponse,
  RequestOtpResponse,
  RightCategory,
  SessionInfo,
  StorageUsage,
  TranscribeResponse,
  UserProfile,
} from "@nyay/shared";

/** Browser-side client. Every call goes to the same-origin proxy at /api/v1, which adds the session token. */

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: ApiError | null,
  ) {
    super(message);
  }

  get retryAfter(): number | null {
    return this.body?.retry_after ?? null;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(isForm || init.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    const next = window.location.pathname + window.location.search;
    window.location.assign(new URL(`/signin?next=${encodeURIComponent(next)}`, window.location.origin).href);
  }
  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      body = null;
    }
    const retry = res.headers.get("retry-after");
    if (body && retry) body.retry_after = Number(retry);
    throw new HttpError(body?.detail ?? body?.title ?? `Request failed (${res.status})`, res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  requestOtp: (phone: string) => request<RequestOtpResponse>("/auth/request-otp", json("POST", { phone })),
  resendOtp: (phone: string) => request<RequestOtpResponse>("/auth/resend-otp", json("POST", { phone })),

  me: () => request<UserProfile>("/users/me"),
  updateMe: (patch: ProfileUpdate) => request<UserProfile>("/users/me", json("PATCH", patch)),
  updateNotifications: (patch: Partial<NotificationPrefs>) =>
    request<UserProfile>("/users/me/notifications", json("PATCH", patch)),
  updatePrivacy: (patch: Partial<PrivacyPrefs>) => request<UserProfile>("/users/me/privacy", json("PATCH", patch)),
  storage: () => request<StorageUsage>("/users/me/storage"),
  sessions: () => request<SessionInfo[]>("/users/me/sessions"),
  revokeSession: (id: string) => request<void>(`/users/me/sessions/${id}`, { method: "DELETE" }),
  revokeOtherSessions: () => request<void>("/users/me/sessions/revoke-others", { method: "POST" }),
  requestDeleteCode: () => request<RequestOtpResponse>("/users/me/delete-code", { method: "POST" }),
  deleteAccount: (code: string) => request<void>("/users/me", json("DELETE", { code })),

  query: (req: QueryRequest) => request<QueryResponse>("/query", json("POST", req)),

  listChats: (params: { q?: string; category?: string; pinned?: boolean } = {}) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.category) sp.set("category", params.category);
    if (params.pinned) sp.set("pinned", "true");
    const qs = sp.toString();
    return request<ChatSummary[]>(`/chats${qs ? `?${qs}` : ""}`);
  },
  getChat: (id: string) => request<ChatDetail>(`/chats/${id}`),
  updateChat: (id: string, patch: ChatUpdate) => request<ChatSummary>(`/chats/${id}`, json("PATCH", patch)),
  deleteChat: (id: string) => request<void>(`/chats/${id}`, { method: "DELETE" }),
  chatError: (id: string) => request<Diagnostic>(`/chats/${id}/error`),
  chatTrace: (id: string) => request<Record<string, unknown>>(`/chats/${id}/error/trace`),
  reportMessage: (chatId: string, messageId: string) =>
    request<{ reported: boolean; trace_id: string }>(`/chats/${chatId}/messages/${messageId}/report`, {
      method: "POST",
    }),

  listDrafts: (params: { status?: string; category?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.status) sp.set("status", params.status);
    if (params.category) sp.set("category", params.category);
    const qs = sp.toString();
    return request<Draft[]>(`/drafts${qs ? `?${qs}` : ""}`);
  },
  createDraft: (body: DraftCreate) => request<Draft>("/drafts", json("POST", body)),
  getDraft: (id: string) => request<Draft>(`/drafts/${id}`),
  updateDraft: (id: string, patch: DraftUpdate) => request<Draft>(`/drafts/${id}`, json("PATCH", patch)),
  deleteDraft: (id: string) => request<void>(`/drafts/${id}`, { method: "DELETE" }),
  markSent: (id: string) => request<Draft>(`/drafts/${id}/mark-sent`, { method: "POST" }),
  improveDraft: (id: string, body: ImproveRequest) => request<Draft>(`/drafts/${id}/improve`, json("POST", body)),
  draftVersions: (id: string) => request<DraftVersion[]>(`/drafts/${id}/versions`),

  rights: (q?: string) => request<RightCategory[]>(`/rights${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  transcribe: (audio: Blob, language: Language) => {
    const form = new FormData();
    form.append("audio", audio, "recording.webm");
    form.append("language", language);
    return request<TranscribeResponse>("/voice/transcribe", { method: "POST", body: form });
  },
};

export function draftDownloadUrl(id: string, format: "html" | "pdf" = "html"): string {
  return `/api/v1/drafts/${id}/download?format=${format}`;
}

export const EXPORT_URL = "/api/v1/users/me/export";

export function voicePreviewUrl(language: Language): string {
  return `/api/v1/voice/preview?language=${language}`;
}

/** Clears the HttpOnly session cookie and revokes the session on the API. */
export async function signOut(): Promise<void> {
  await fetch("/api/session", { method: "DELETE" });
}

export function ttsUrl(text: string, language: Language): string {
  return `/api/v1/voice/tts?language=${language}&text=${encodeURIComponent(text.slice(0, 900))}`;
}
