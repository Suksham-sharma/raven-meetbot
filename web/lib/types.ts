export interface User {
  id: string;
  email: string;
  name: string | null;
}

export type CalendarMode = "manual" | "all";

export type BotState =
  | "queued"
  | "dispatched"
  | "joining_meeting"
  | "waiting_admission"
  | "admitted"
  | "recording"
  | "alone_detected"
  | "alone_too_long"
  | "suspended"
  | "finalizing_upload"
  | "stopping"
  | "ended"
  | "error"
  | (string & {});

export type BotQueueState =
  | "active"
  | "waiting"
  | "delayed"
  | "prioritized"
  | "completed"
  | "failed"
  | "unknown";

export interface BotSummary {
  jobId: string;
  status: BotState;
  queueState: BotQueueState;
  meetingUrl: string;
  botName: string;
  createdAt: string;
}

export interface AgentAction {
  id: number;
  meeting_id: string;
  kind: "linear_issue" | "slack_message";
  title: string;
  payload: Record<string, unknown>;
  reasoning: string | null;
  status: "proposed" | "executing" | "executed" | "failed" | "rejected";
  result: { url?: string; externalId?: string; error?: string } | null;
  evidence: {
    quote: string;
    start_s: number | null;
    end_s: number | null;
    clip: string | null;
  } | null;
  created_at: string;
  executed_at: string | null;
}

export interface LastTime {
  meeting_id: string;
  title: string | null;
  date: string | null;
  decisions: { text: string; speaker: string | null; start_s: number }[];
  open_actions: { text: string; owner: string | null; due: string | null }[];
}

export interface UpcomingMeeting {
  id: number;
  jobId: string;
  title: string | null;
  meetUrl: string;
  startsAt: string;
  endsAt: string | null;
  status: "scheduled" | "running" | "skipped";
  last_time: LastTime | null;
}

export interface CalendarConnection {
  email: string;
  mode: CalendarMode;
  status: "connected" | "disconnected";
  lastCheckedAt: string | null;
  lastError: string | null;
  connectedAt: string;
}

export interface CalendarResponse {
  calendar: CalendarConnection | null;
}

export interface MeetingSummary {
  id: string;
  title: string | null;
  type: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_s: number | null;
  participants: string[];
  status: string;
  status_error: string | null;
  has_recording: boolean;
  first_chapter: string | null;
  summary: string | null;
}

export interface Corpus {
  total: number;
  from: string | null;
  to: string | null;
}

export interface MeetingsPage {
  meetings: MeetingSummary[];
  next_before: string | null;
  corpus: Corpus;
}

export interface Chapter {
  seq: number;
  title: string;
  gist: string | null;
  start_s: number;
  end_s: number;
}

export interface Decision {
  id: number;
  seq: number;
  text: string;
  evidence_quote: string;
  speaker: string | null;
  start_s: number;
  end_s: number;
}

export interface MeetingActionItem extends Decision {
  owner: string | null;
  due: string | null;
  completed_at: string | null;
}

export interface MeetingDetail extends MeetingSummary {
  summary: string | null;
  recording_offset_s: number;
  chapters: Chapter[];
  decisions: Decision[];
  action_items: MeetingActionItem[];
}

export interface Recording {
  meeting_id: string;
  url: string;
  poster_url: string | null;
  mime: string;
  seekable: boolean;
  duration_s: number | null;
  recording_offset_s: number;
}

export interface TranscriptTurn {
  speaker: string;
  start_s: number;
  end_s: number;
  text: string;
}

export interface Transcript {
  meeting_id: string;
  recording_offset_s: number;
  turns: TranscriptTurn[];
}

export interface OpenAction {
  id: number;
  text: string;
  owner: string | null;
  due: string | null;
  evidence_quote: string;
  speaker: string | null;
  start_s: number;
  end_s: number;
  completed_at: string | null;
  meeting_id: string;
  meeting_title: string | null;
  meeting_started_at: string | null;
}

export interface Citation {
  meetingId: string;
  start_s: number;
  end_s: number;
  speaker: string | null;
  text: string;
  recordingUrl: string | null;
}

export interface Answer {
  answer: string;
  citations: Citation[];
  grounded: boolean;
  refused: boolean;
  retrieved_meetings: string[];
  iterations: number;
}

export type AskStreamEvent =
  | { type: "thinking"; message: string }
  | { type: "tool_call"; name: string; arguments: string; parsedArgs: unknown }
  | { type: "tool_result"; name: string; arguments: string; result: unknown; summary: string; empty?: boolean }
  | { type: "answer"; answer: string }
  | {
      type: "done";
      answer: string;
      citations: Citation[];
      grounded: boolean;
      refused: boolean;
      retrieved_meetings: string[];
      contexts?: string[];
      iterations: number;
    }
  | { type: "error"; message: string };

export interface AskStep {
  id: string;
  name: string;
  label: string;
  detail: string;
  status: "running" | "done" | "error";
  summary?: string;
  empty?: boolean;
}
