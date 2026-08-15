import type {
  Answer,
  MeetingDetail,
  MeetingsPage,
  OpenAction,
  Recording,
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

  // 409 until transcode finishes, which is the normal state for a few minutes
  // after every call — the caller renders that as processing, not as an error.
  recording: (id: string) =>
    request<Recording>(`/meetings/${encodeURIComponent(id)}/recording`),

  // Blocking, 3–40s, up to 8 sequential LLM round-trips. No streaming exists.
  // `meetingId` confines the agent to one meeting; omit it to search everything.
  ask: (q: string, meetingId?: string) =>
    request<Answer>("/ask", {
      method: "POST",
      body: JSON.stringify({ q, meeting_id: meetingId }),
      timeoutMs: 60_000,
    }),

  // Streaming variant — yields tool-call progress via SSE (POST + JWT, so fetch + ReadableStream, not EventSource).
  askStream: async (
    q: string,
    onEvent: (event: import("./types").AskStreamEvent) => void,
    opts?: { meetingId?: string; signal?: AbortSignal },
  ): Promise<void> => {
    const res = await fetch(`/api/v1/ask/stream`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ q, meeting_id: opts?.meetingId }),
      signal: opts?.signal,
    });
    if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
    if (!res.body) throw new Error("No response body for stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are `data: {...}\n\n` — split on double newline and parse complete frames
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLines = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        if (!dataLines.length) continue;
        const raw = dataLines.join("\n");
        try {
          const event = JSON.parse(raw) as import("./types").AskStreamEvent;
          onEvent(event);
        } catch {
          // ignore malformed frame
        }
      }
    }

    // Flush trailing frame if server ended without double newline
    if (buffer.trim().startsWith("data:")) {
      const raw = buffer.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
      if (raw) {
        try {
          onEvent(JSON.parse(raw) as import("./types").AskStreamEvent);
        } catch {
          // ignore
        }
      }
    }
  },
};
