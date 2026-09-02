import type {
  Answer,
  CalendarMode,
  CalendarResponse,
  MeetingDetail,
  MeetingsPage,
  OpenAction,
  Recording,
  Session,
  Transcript,
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly reason?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const SERVER_FAULT = "Something went wrong on our end. Try again in a moment.";

export class StreamStalledError extends Error {
  constructor() {
    super("The connection to Raven dropped.");
    this.name = "StreamStalledError";
  }
}

// Gaps between frames, not a total deadline (an agent run takes minutes).
// Must stay above the server's 15s heartbeat.
const STREAM_CONNECT_MS = 20_000;
const STREAM_IDLE_MS = 40_000;

// Routes answer with `message`, but the action endpoints answer with `error`
// and carry a `reason` discriminant. Reading only `message` turned "linear is
// not connected" into the bare word "Conflict".
async function errorInfo(res: Response): Promise<{ message: string; reason?: string }> {
  let body: { message?: string; error?: string; reason?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
  }
  const raw = body.message || body.error || "";
  if (res.status >= 500) {
    if (raw) console.error("[api]", res.status, raw);
    return { message: SERVER_FAULT };
  }
  return { message: raw || res.statusText || "Request failed", reason: body.reason };
}

async function apiError(res: Response): Promise<ApiError> {
  const { message, reason } = await errorInfo(res);
  return new ApiError(res.status, message, reason);
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
  if (!res.ok) throw await apiError(res);
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
  me: () => request<Session>("/auth/me"),

  login: (email: string, password: string) =>
    request<Session>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string, name?: string) =>
    request<Session>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),

  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  bots: () => request<{ bots: import("./types").BotSummary[] }>("/bots"),

  stopBot: (jobId: string) =>
    request<{ jobId: string; status: "cancelled" | "stopping" }>(
      `/bots/${encodeURIComponent(jobId)}/stop`,
      { method: "POST" }
    ),

  calendar: () => request<CalendarResponse>("/calendar"),

  upcoming: () =>
    request<{ upcoming: import("./types").UpcomingMeeting[] }>(
      "/calendar/upcoming"
    ),

  updateCalendar: (mode: CalendarMode) =>
    request<{ calendar: { mode: CalendarMode } }>("/calendar", {
      method: "PATCH",
      body: JSON.stringify({ mode }),
    }),

  disconnectCalendar: () =>
    request<{ ok: boolean }>("/calendar/disconnect", { method: "POST" }),

  syncCalendar: () =>
    request<{ schedules: unknown[] }>("/calendar/sync", { method: "POST" }),

  meetings: (params: { limit?: number; before?: string; q?: string; type?: string; participant?: string; from?: string; to?: string } = {}) =>
    request<MeetingsPage>(`/meetings${query(params as Record<string, string | number | undefined>)}`),

  meeting: (id: string) =>
    request<MeetingDetail>(`/meetings/${encodeURIComponent(id)}`),

  updateMeeting: (id: string, title: string) =>
    request<MeetingDetail>(`/meetings/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ title }) }),

  deleteMeeting: (id: string) =>
    request<void>(`/meetings/${encodeURIComponent(id)}`, { method: "DELETE" }),

  exportMeeting: (id: string, format: "json" | "md" = "json") =>
    fetch(`/api/v1/meetings/${encodeURIComponent(id)}/export?format=${format}`, { credentials: "same-origin" }).then((r) => {
      if (!r.ok) throw new Error("export failed");
      return r;
    }),

  meetingActions: (id: string) =>
    request<{ meeting_id: string; actions: import("./types").AgentAction[] }>(
      `/meetings/${encodeURIComponent(id)}/actions`
    ),

  approveAction: (id: number) =>
    request<{
      executed: boolean;
      dry_run?: boolean;
      action: import("./types").AgentAction;
    }>(`/actions/${id}/approve`, { method: "POST", body: JSON.stringify({}) }),

  rejectAction: (id: number) =>
    request<{ action: import("./types").AgentAction }>(`/actions/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  retryMeeting: (id: string) =>
    request<{ meeting_id: string; enqueued: string }>(`/meetings/${encodeURIComponent(id)}/retry`, {
      method: "POST",
    }),

  joinMeet: (url: string, botName?: string) =>
    request<{ jobId: string; message: string }>("/join-meet", {
      method: "POST",
      body: JSON.stringify({ url, botName }),
    }),

  botStatus: (jobId: string) =>
    request<{ jobId: string; status: string; meetingUrl: string; botName: string; timeline: { state: string; timestamp: string }[] }>(
      `/bots/${encodeURIComponent(jobId)}/status`
    ),

  presignUpload: (title?: string, fileName?: string, contentType?: string, contentLength?: number) =>
    request<{ meeting_id: string; key: string; upload_url: string; method: string; headers: Record<string, string> }>("/meetings/upload/presign", {
      method: "POST",
      body: JSON.stringify({ title, fileName, contentType, contentLength }),
    }),

  completeUpload: (meetingId: string) =>
    request<{ meeting_id: string; status: string }>(`/meetings/${encodeURIComponent(meetingId)}/complete`, { method: "POST" }),

  directUpload: (meetingId: string, file: File) =>
    fetch(`/api/v1/meetings/${encodeURIComponent(meetingId)}/upload`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": file.type || "video/webm" },
      body: file,
    }).then(async (r) => {
      if (!r.ok) throw await apiError(r);
      return r.json() as Promise<{ meeting_id: string; key: string }>;
    }),

  uploadMeeting: async (file: File, title?: string) => {
    const presign = await api.presignUpload(title, file.name, file.type, file.size);
    const isLocal = presign.upload_url.startsWith("/api/");
    if (isLocal) {
      await api.directUpload(presign.meeting_id, file);
    } else {
      const put = await fetch(presign.upload_url, { method: "PUT", headers: presign.headers, body: file });
      if (!put.ok) throw new ApiError(put.status, `upload failed: ${put.statusText}`);
    }
    await api.completeUpload(presign.meeting_id);
    return { meeting_id: presign.meeting_id, key: presign.key, status: "processing" };
  },

  bulkUpload: async (files: File[]) => {
    const results = await Promise.all(
      files.map(async (file) => {
        try {
          const result = await api.uploadMeeting(file);
          return {
            meeting_id: result.meeting_id,
            key: result.key,
            status: result.status,
          };
        } catch (error) {
          return {
            meeting_id: "",
            key: "",
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
    return { meetings: results };
  },

  actionItems: (params: { limit?: number } = {}) =>
    request<{ items: OpenAction[] }>(`/action-items${query(params)}`),

  setActionItemCompleted: (id: number, completed: boolean) =>
    request<{ id: number; completed_at: string | null }>(
      `/action-items/${id}`,
      { method: "PATCH", body: JSON.stringify({ completed }) },
    ),

  transcript: (id: string) =>
    request<Transcript>(`/meetings/${encodeURIComponent(id)}/transcript`),

  recording: (id: string) =>
    request<Recording>(`/meetings/${encodeURIComponent(id)}/recording`),

  ask: (q: string, meetingId?: string) =>
    request<Answer>("/ask", {
      method: "POST",
      body: JSON.stringify({ q, meeting_id: meetingId }),
      timeoutMs: 60_000,
    }),

  askStream: async (
    q: string,
    onEvent: (event: import("./types").AskStreamEvent) => void,
    opts?: { meetingId?: string; signal?: AbortSignal },
  ): Promise<void> => {
    const control = new AbortController();
    const relay = () => control.abort();
    if (opts?.signal?.aborted) control.abort();
    opts?.signal?.addEventListener("abort", relay, { once: true });

    let stalled = false;
    let clock: ReturnType<typeof setTimeout> | undefined;
    const arm = (ms: number) => {
      clearTimeout(clock);
      clock = setTimeout(() => {
        stalled = true;
        control.abort();
      }, ms);
    };

    try {
      arm(STREAM_CONNECT_MS);
      const res = await fetch(`/api/v1/ask/stream`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ q, meeting_id: opts?.meetingId }),
        signal: control.signal,
      });
      if (!res.ok) throw await apiError(res);
      if (!res.body) throw new Error("No response body for stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        arm(STREAM_IDLE_MS);
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

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
          }
        }
      }

      if (buffer.trim().startsWith("data:")) {
        const raw = buffer.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
        if (raw) {
          try {
            onEvent(JSON.parse(raw) as import("./types").AskStreamEvent);
          } catch {
          }
        }
      }
    } catch (err) {
      if (stalled) throw new StreamStalledError();
      throw err;
    } finally {
      clearTimeout(clock);
      opts?.signal?.removeEventListener("abort", relay);
    }
  },
};
