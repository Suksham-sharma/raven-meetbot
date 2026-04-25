export interface MeetBotJob {
  url: string;
  botName: string;
  maxDurationMinutes: number | null;
}

export interface StatusEvent {
  state: string;
  timestamp: string;
  recording?: string;
  [key: string]: unknown;
}

export interface BotMetrics {
  deepgramSeconds: number;
  r2BytesStored: number;
}

export const TERMINAL_STATES = new Set([
  "ended",
  "kicked",
  "error",
  "timeout",
  "complete",
]);

export const POST_JOIN_STATES = new Set([
  "admitted",
  "recording",
  "alone_detected",
  "finalizing_upload",
  "complete",
]);
