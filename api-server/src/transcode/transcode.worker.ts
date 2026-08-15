import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { rmSync } from "fs";
import os from "os";
import path from "path";
import systemConfig from "../config";
import { db, pool } from "../db/client";
import { meetings } from "../db/schema";
import { getArtifactStore } from "../diarize/artifactStore";
import { transcodeQueue, type TranscodeJob } from "../lib/queueManager";
import { posterFrame, probeDuration, toMp4 } from "./transcode";

// One job = one finished recording → seekable mp4 + poster. Its own queue, not
// a diarize stage: an encode is CPU-bound minutes and would park every later
// meeting's transcript behind it.
//
// Run: pnpm worker:transcode (needs ffmpeg on PATH)

export function mp4KeyFor(meetingId: string): string {
  return `${meetingId}.mp4`;
}
export function posterKeyFor(meetingId: string): string {
  return `${meetingId}.poster.jpg`;
}

const worker = new Worker<TranscodeJob>(
  "transcode",
  async (job) => {
    const { meetingId, recordingKey } = job.data;
    const log = (m: string) => console.log(`[transcode] ${meetingId}: ${m}`);
    log(`start (job ${job.id})`);

    await db
      .update(meetings)
      .set({ status: "transcoding", statusError: null })
      .where(eq(meetings.id, meetingId));

    const store = getArtifactStore();
    const src = await store.resolve(recordingKey);
    const mp4Path = path.join(os.tmpdir(), `${meetingId}.mp4`);
    const jpgPath = path.join(os.tmpdir(), `${meetingId}.poster.jpg`);

    try {
      let last = -1;
      await toMp4(src.path, mp4Path, (pct) => {
        if (pct >= last + 25) {
          last = pct;
          log(`${pct}%`);
        }
      });

      const duration = await probeDuration(mp4Path);
      if (duration == null) {
        throw new Error("transcoded mp4 has no duration — it would not be seekable");
      }
      await posterFrame(mp4Path, jpgPath, Math.min(5, duration / 2));

      const mp4Key = mp4KeyFor(meetingId);
      const posterKey = posterKeyFor(meetingId);
      await store.writeFile(mp4Key, mp4Path);
      await store.writeFile(posterKey, jpgPath);
      log(`wrote ${mp4Key} (${duration.toFixed(0)}s) + ${posterKey}`);

      const updated = await db
        .update(meetings)
        .set({ mp4Key, posterKey })
        .where(eq(meetings.id, meetingId))
        .returning({ id: meetings.id });

      log(updated.length ? "meeting row updated" : "no meeting row yet — ingest will pick it up");

      return { meetingId, mp4Key, posterKey, durationS: duration };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .update(meetings)
        .set({ status: "failed", statusError: `transcode: ${msg}` })
        .where(eq(meetings.id, meetingId));
      throw err;
    } finally {
      await src.cleanup();
      rmSync(mp4Path, { force: true });
      rmSync(jpgPath, { force: true });
    }
  },
  {
    connection: { url: systemConfig.REDIS_URL },
    concurrency: systemConfig.TRANSCODE_WORKER_CONCURRENCY,
    // An encode outlives the default 30s lock, and a lock that expires mid-job
    // gets the work marked stalled and run again.
    lockDuration: systemConfig.TRANSCODE_LOCK_MS,
  }
);

worker.on("failed", (job, err) => {
  console.error(`[transcode] job ${job?.id} (${job?.data.meetingId}) failed:`, err.message);
});

console.log(
  `[transcode] worker up, concurrency=${systemConfig.TRANSCODE_WORKER_CONCURRENCY}, draining "transcode" queue`
);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[transcode] received ${signal}, closing worker...`);
  await worker.close();
  await transcodeQueue.close();
  await pool.end();
  console.log("[transcode] worker closed.");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
