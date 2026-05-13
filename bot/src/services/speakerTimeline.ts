import { Page } from "playwright";
import { createStorageSink, StorageSink } from "./storageSink";
import { NAME_SHIM } from "../browser/pcTap";
import { speakerTrackerMain } from "../browser/speakerTracker";

const FLUSH_AT_LINES = 200;

// Streams the who-was-speaking-when timeline to {meetingId}.speakers.jsonl.
// Failures must never affect the recording — callers treat null keys as
// "no timeline this meeting".
class SpeakerTimeline {
  private uploader: StorageSink;
  private key: string;
  private buffer: string[] = [];
  private events = 0;
  private started = false;
  private stopped = false;

  constructor(meetingId: string) {
    this.key = `${meetingId}.speakers.jsonl`;
    this.uploader = createStorageSink(this.key);
  }

  async start(page: Page, recordingStartEpochMs: number): Promise<void> {
    await this.uploader.init();

    await page.exposeFunction("__speakerEvent", (line: string) => {
      if (this.stopped) return;
      this.events++;
      this.buffer.push(line);
      if (this.buffer.length >= FLUSH_AT_LINES) this.flush();
    });

    // lets post-processing align event epochs to the recording
    this.buffer.push(
      JSON.stringify({ type: "meta", t: Date.now(), recordingStartEpochMs })
    );

    await page.evaluate(NAME_SHIM);
    await page.evaluate(speakerTrackerMain, {
      sampleMs: 250,
      levelThreshold: 0.05,
      ringWindowMs: 3000,
      bindVotes: 3,
    });

    this.started = true;
    console.log(`[Speakers] Tracker started → ${this.key}`);
  }

  private flush(): void {
    if (this.buffer.length === 0) return;
    const chunk = Buffer.from(this.buffer.join("\n") + "\n");
    this.buffer = [];
    // Best-effort: a swallowed rejection here would crash the recording process.
    void this.uploader.addChunk(chunk).catch((err) => {
      console.error("[Speakers] chunk write failed:", err);
    });
  }

  async stop(page: Page | null): Promise<string | null> {
    if (this.stopped) return null;

    if (page && this.started) {
      try {
        await page.evaluate(() => window.__speakerStop?.());
        await page.waitForTimeout(300); // final events flush
      } catch {
        // page may already be gone
      }
    }
    this.stopped = true;
    this.flush();

    if (!this.started || this.events === 0) {
      await this.uploader.abort();
      return null;
    }

    try {
      const key = await this.uploader.complete();
      console.log(`[Speakers] Timeline uploaded: ${key} (${this.events} events)`);
      return key;
    } catch (err) {
      console.error("[Speakers] Upload failed:", err);
      return null;
    }
  }

  async abort(): Promise<void> {
    this.stopped = true;
    await this.uploader.abort();
  }
}

export default SpeakerTimeline;
