export interface MeetBotJob {
  url: string;
  botName: string;
  maxDurationMinutes: number | null;
  ownerId?: string | null;
}

export interface StatusEvent {
  state: string;
  timestamp: string;
  recording?: string;
  speakers?: string;
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
