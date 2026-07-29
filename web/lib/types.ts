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
}

export interface MeetingDetail extends MeetingSummary {
  summary: string | null;
  recording_offset_s: number;
  chapters: Chapter[];
  decisions: Decision[];
  action_items: MeetingActionItem[];
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
