import { Pool } from "pg";
import config from "./config";

/**
 * The entire database contract of this service: three statements against one
 * table. Raw `pg` rather than the api-server's Drizzle schema, so this service
 * has no domain model to quietly grow into (docs/decisions.md D6).
 *
 * The cost is that a column rename fails at runtime, not compile time.
 * schema.test.ts guards it against the migrations.
 */

export const pool = new Pool({ connectionString: config.DATABASE_URL });

export async function markStatus(meetingId: string, status: string): Promise<void> {
  await pool.query(
    `UPDATE meetings SET status = $1, status_error = NULL WHERE id = $2`,
    [status, meetingId]
  );
}

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
