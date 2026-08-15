export interface User {
  id: string;
  email: string;
  name: string | null;
}

export interface MeetingSummary {
  id: string;
  /** Null for every real meeting — the backend never sets one. */
  title: string | null;
  type: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_s: number | null;
  participants: string[];
  status: string;
  has_recording: boolean;
  /** Lowest-seq chapter title — the best name available when `title` is null. */
  first_chapter: string | null;
  /** One line of what happened, for the recent-meeting cards. Null until ingest. */
  summary: string | null;
}

/** The whole archive, not the page — it states the boundary an answer spans. */
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
  /** Free text as spoken ("end of week"). Not a date — never parse it. */
  due: string | null;
  /** When it was ticked off. Null is open. */
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
  /** Presigned when the store can sign, else a same-origin streaming path. */
  url: string;
  poster_url: string | null;
  mime: string;
  /**
   * False when only the raw capture exists. A live-written WebM has no duration
   * and no cues, so it plays but cannot seek — and every citation is a seek.
   */
  seekable: boolean;
  duration_s: number | null;
  /** Citations land at `start_s + this`. */
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

/** An action item lifted out of its meeting, for the cross-meeting list. */
export interface OpenAction {
  id: number;
  text: string;
  owner: string | null;
  /** Free text as spoken ("end of week"). Not a date — never parse it. */
  due: string | null;
  evidence_quote: string;
  speaker: string | null;
  start_s: number;
  end_s: number;
  /** When it was ticked off. Null is open. */
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
  /** `<r2-key>#t=<sec>` — a key, not a resolvable URL. */
  recordingUrl: string | null;
}

export interface Answer {
  answer: string;
  citations: Citation[];
  /** False when claims could not be tied to a source — served as a normal 200. */
  grounded: boolean;
  /** True when nothing matched — also a 200. Render as empty, never as an error. */
  refused: boolean;
  retrieved_meetings: string[];
  iterations: number;
}

export type AskStreamEvent =
  | { type: "thinking"; message: string }
  | { type: "tool_call"; name: string; arguments: string; parsedArgs: unknown }
  | { type: "tool_result"; name: string; arguments: string; result: unknown; summary: string }
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
}
