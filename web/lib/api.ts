import type {
  Answer,
  MeetingDetail,
  MeetingsPage,
  OpenAction,
  Transcript,
  User,
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const SERVER_FAULT = "Something went wrong on our end. Try again in a moment.";

async function errorMessage(res: Response): Promise<string> {
  let raw = "";
  try {
    raw = ((await res.json()) as { message?: string })?.message ?? "";
  } catch {
    // no body, or not JSON
  }
  // 5xx messages come from asyncHandler, which forwards raw exception text.
  if (res.status >= 500) {
    if (raw) console.error("[api]", res.status, raw);
    return SERVER_FAULT;
  }
  return raw || res.statusText || "Request failed";
}

async function request<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const { timeoutMs, ...rest } = init ?? {};
  const abort = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;

  const res = await fetch(`/api/v1${path}`, {
    credentials: "same-origin",
    signal: abort,
    ...rest,
    headers: { "content-type": "application/json", ...rest.headers },
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res.json() as Promise<T>;
}

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const api = {
  me: () => request<{ user: User }>("/auth/me"),

  login: (email: string, password: string) =>
    request<{ user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string, name?: string) =>
    request<{ user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),

  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  meetings: (params: { limit?: number; before?: string } = {}) =>
    request<MeetingsPage>(`/meetings${query(params)}`),

  meeting: (id: string) =>
    request<MeetingDetail>(`/meetings/${encodeURIComponent(id)}`),

  actionItems: (params: { limit?: number } = {}) =>
    request<{ items: OpenAction[] }>(`/action-items${query(params)}`),

  setActionItemCompleted: (id: number, completed: boolean) =>
    request<{ id: number; completed_at: string | null }>(
      `/action-items/${id}`,
      { method: "PATCH", body: JSON.stringify({ completed }) },
    ),

  transcript: (id: string) =>
    request<Transcript>(`/meetings/${encodeURIComponent(id)}/transcript`),

  // Blocking, 3–40s, up to 8 sequential LLM round-trips. No streaming exists.
  ask: (q: string) =>
    request<Answer>("/ask", {
      method: "POST",
      body: JSON.stringify({ q }),
      timeoutMs: 60_000,
    }),
};
