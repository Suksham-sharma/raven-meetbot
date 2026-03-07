import { DeepgramClient, type Deepgram } from "@deepgram/sdk";
import botConfig from "../config";
import R2Uploader from "./r2Uploader";

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
  private r2Uploader: R2Uploader | null = null;
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
    this.r2Uploader = new R2Uploader(`${this.meetingId}.transcript.jsonl`);
    await this.r2Uploader.init();

    this.connection = await this.client.listen.v1.connect({
      Authorization: `Token ${botConfig.DEEPGRAM_API_KEY}`,
      model: "nova-3",
      language: "en",
      punctuate: "true",
      diarize: "true",
      interim_results: "false",
      encoding: "opus" as Deepgram.ListenV1Encoding,
      sample_rate: 48000,
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

    // Flush transcript buffer to R2 every 30s
    this.flushTimer = setInterval(() => this.flushToR2(), 30_000);

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

  private async flushToR2(): Promise<void> {
    if (this.jsonlBuffer.length === 0 || !this.r2Uploader) return;

    const data = this.jsonlBuffer.join("\n") + "\n";
    this.jsonlBuffer = [];

    try {
      await this.r2Uploader.addChunk(Buffer.from(data, "utf-8"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Transcriber] Failed to flush to R2: ${message}`);
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
    await this.flushToR2();

    if (this.r2Uploader) {
      await this.r2Uploader.complete();
    }

    console.log(
      `[Transcriber] Stopped. ${this.segments.length} segments captured.`
    );
    return this.segments;
  }

  getSegments(): TranscriptSegment[] {
    return this.segments;
  }
}

export default Transcriber;
