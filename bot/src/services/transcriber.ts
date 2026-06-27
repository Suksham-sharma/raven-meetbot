import { DeepgramClient, type Deepgram } from "@deepgram/sdk";
import botConfig from "../config";
import { createStorageSink, StorageSink } from "./storageSink";

interface TranscriptSegment {
  speaker: number;
  text: string;
  start: number;
  end: number;
  confidence: number;
  isFinal: boolean;
}

type V1Socket = Awaited<
  ReturnType<InstanceType<typeof DeepgramClient>["listen"]["v1"]["connect"]>
>;

class Transcriber {
  private client: DeepgramClient;
  private connection: V1Socket | null = null;
  private transcriptSink: StorageSink | null = null;
  private segments: TranscriptSegment[] = [];
  private jsonlBuffer: string[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private meetingId: string;

  constructor(meetingId: string) {
    this.client = new DeepgramClient({ apiKey: botConfig.DEEPGRAM_API_KEY });
    this.meetingId = meetingId;
  }

  async start(): Promise<void> {
    // R2 when configured, local recordings/ dir otherwise — mirrors recordingSink.
    this.transcriptSink = createStorageSink(`${this.meetingId}.transcript.jsonl`);
    await this.transcriptSink.init();

    // The browser sends audio/webm;codecs=opus chunks (a WebM-CONTAINERIZED Opus
    // stream from MediaRecorder). Do NOT declare encoding/sample_rate — that tells
    // Deepgram the bytes are raw Opus and breaks its container detection, so it
    // decodes nothing, emits no transcript, idle-times-out, and reconnect-loops.
    // Omitting them lets Deepgram auto-detect the WebM/Opus container from the
    // stream header (the standard MediaRecorder -> Deepgram-live path).
    this.connection = await this.client.listen.v1.connect({
      Authorization: `Token ${botConfig.DEEPGRAM_API_KEY}`,
      model: "nova-3",
      language: "en",
      punctuate: "true",
      diarize: "true",
      interim_results: "false",
    });

    this.connection.on("open", () => {
      this.connected = true;
      console.log("[Transcriber] Deepgram connection opened");
    });

    this.connection.on("message", (data) => {
      if (data.type === "Results") {
        this.handleResult(data);
      }
    });

    this.connection.on("error", (err) => {
      console.error("[Transcriber] Deepgram error:", err.message);
    });

    this.connection.on("close", () => {
      this.connected = false;
      console.log("[Transcriber] Deepgram connection closed");
    });

    this.connection.connect();
    await this.connection.waitForOpen();

    // Flush transcript buffer to storage every 30s
    this.flushTimer = setInterval(() => this.flushToSink(), 30_000);

    console.log("[Transcriber] Started");
  }

  sendAudio(chunk: Buffer): void {
    if (!this.connected || !this.connection) return;

    try {
      this.connection.sendMedia(chunk);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[Transcriber] Failed to send audio: ${message}`);
    }
  }

  private handleResult(data: Deepgram.listen.ListenV1Results): void {
    const alt = data.channel?.alternatives?.[0];
    if (!alt?.transcript) return;

    const isFinal = Boolean(data.is_final);
    const words = alt.words ?? [];

    // Group words by speaker for cleaner segments
    if (words.length > 0) {
      let currentSpeaker = words[0].speaker ?? 0;
      let segmentWords: typeof words = [];

      for (const word of words) {
        const speaker = word.speaker ?? 0;
        if (speaker !== currentSpeaker && segmentWords.length > 0) {
          this.addSegment(currentSpeaker, segmentWords, isFinal);
          segmentWords = [];
          currentSpeaker = speaker;
        }
        segmentWords.push(word);
      }

      if (segmentWords.length > 0) {
        this.addSegment(currentSpeaker, segmentWords, isFinal);
      }
    } else if (alt.transcript.trim()) {
      // Fallback: no word-level data
      const segment: TranscriptSegment = {
        speaker: 0,
        text: alt.transcript.trim(),
        start: data.start ?? 0,
        end: (data.start ?? 0) + (data.duration ?? 0),
        confidence: alt.confidence ?? 0,
        isFinal,
      };
      this.segments.push(segment);
      this.jsonlBuffer.push(JSON.stringify(segment));
    }
  }

  private addSegment(
    speaker: number,
    words: Array<{
      word: string;
      start: number;
      end: number;
      confidence: number;
    }>,
    isFinal: boolean
  ): void {
    const segment: TranscriptSegment = {
      speaker,
      text: words.map((w) => w.word).join(" "),
      start: words[0].start,
      end: words[words.length - 1].end,
      confidence:
        words.reduce((sum, w) => sum + w.confidence, 0) / words.length,
      isFinal,
    };
    this.segments.push(segment);
    this.jsonlBuffer.push(JSON.stringify(segment));
  }

  private async flushToSink(): Promise<void> {
    if (this.jsonlBuffer.length === 0 || !this.transcriptSink) return;

    const data = this.jsonlBuffer.join("\n") + "\n";
    this.jsonlBuffer = [];

    try {
      await this.transcriptSink.addChunk(Buffer.from(data, "utf-8"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Transcriber] Failed to flush transcript: ${message}`);
    }
  }

  async stop(): Promise<TranscriptSegment[]> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.connection && this.connected) {
      try {
        this.connection.sendFinalize({ type: "Finalize" });
        // Give Deepgram a moment to send final results
        await new Promise((r) => setTimeout(r, 2000));
        this.connection.close();
      } catch {
        // Connection may already be closed
      }
    }

    // Final flush
    await this.flushToSink();

    if (this.transcriptSink) {
      await this.transcriptSink.complete();
    }

    console.log(
      `[Transcriber] Stopped. ${this.segments.length} segments captured.`
    );
    return this.segments;
  }

  getSegments(): TranscriptSegment[] {
    return this.segments;
  }

  getProcessedSeconds(): number {
    return Math.round(this.segments.reduce((max, s) => Math.max(max, s.end), 0));
  }
}

export default Transcriber;
