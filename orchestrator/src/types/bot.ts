export interface MeetBotJob {
  url: string;
  botName: string;
  maxDurationMinutes: number | null;
}

export interface StatusEvent {
  state: string;
  timestamp: string;
  [key: string]: unknown;
}

export const TERMINAL_STATES = new Set([
  "ended",
  "kicked",
  "error",
  "timeout",
  "complete",
]);
