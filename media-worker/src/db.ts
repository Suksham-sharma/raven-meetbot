import { Pool } from "pg";
import config from "./config";

/**
 * The entire database contract of this service: a handful of statements against
 * one table. Raw `pg` rather than the api-server's Drizzle schema, so this
 * service has no domain model to quietly grow into (docs/decisions.md D6).
 *
 * The cost is that a column rename fails at runtime, not compile time.
 * schema.test.ts guards it against the migrations.
 */

export const pool = new Pool({ connectionString: config.DATABASE_URL });

export async function markFailed(meetingId: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE meetings SET status = 'failed', status_error = $1 WHERE id = $2`,
    [error, meetingId]
  );
}

export async function setTranscodeOutputs(
  meetingId: string,
  mp4Key: string,
  posterKey: string
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE meetings SET mp4_key = $1, poster_key = $2 WHERE id = $3`,
    [mp4Key, posterKey, meetingId]
  );
  return (res.rowCount ?? 0) > 0;
}

export interface MeetingSeed {
  ownerId?: string | null;
  title?: string | null;
  recordingKey?: string | null;
  scheduledStartMs?: number | null;
}

/**
 * The bot path has no database access by design (docs/decisions.md D6), so the
 * first media worker to pick a captured meeting up is what makes it visible.
 * Both workers call this because diarize is skipped entirely when the bot
 * produced no speakers timeline.
 */
export async function beginProcessing(
  meetingId: string,
  status: string,
  seed: MeetingSeed = {}
): Promise<void> {
  const startedAt = seed.scheduledStartMs ? new Date(seed.scheduledStartMs) : new Date();
  await pool.query(
    `INSERT INTO meetings (id, owner_id, title, recording_url, started_at, status, participants)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, '[]'::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       status = $6,
       status_error = NULL,
       owner_id = coalesce(meetings.owner_id, EXCLUDED.owner_id),
       title = coalesce(meetings.title, EXCLUDED.title),
       recording_url = coalesce(meetings.recording_url, EXCLUDED.recording_url),
       started_at = coalesce(meetings.started_at, EXCLUDED.started_at)`,
    [
      meetingId,
      seed.ownerId ?? null,
      seed.title ?? null,
      seed.recordingKey ?? null,
      startedAt,
      status,
    ]
  );
}
