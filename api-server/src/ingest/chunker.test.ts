import { describe, expect, it } from "vitest";
import { chunkTranscript, type TranscriptSegment } from "./chunker";

const seg = (speaker: string, text: string, start: number, end: number): TranscriptSegment => ({
  speaker,
  text,
  start,
  end,
});

describe("chunkTranscript", () => {
  it("packs short segments into one chunk with correct span", () => {
    const segs = [seg("A", "hello there", 0, 1), seg("B", "general kenobi", 1, 2)];
    const chunks = chunkTranscript(segs, { maxTokens: 500 });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].seq).toBe(0);
    expect(chunks[0].startS).toBe(0);
    expect(chunks[0].endS).toBe(2);
    expect(chunks[0].text).toContain("A: hello there");
    expect(chunks[0].text).toContain("B: general kenobi");
  });

  it("splits past maxTokens, carries overlap, and increments seq", () => {
    const long = "word ".repeat(40).trim(); // ~199 chars -> ~50 tokens
    const segs = [seg("A", long, 0, 1), seg("B", long, 1, 2), seg("C", long, 2, 3)];
    const chunks = chunkTranscript(segs, { maxTokens: 60, overlapTokens: 50 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.seq)).toEqual(chunks.map((_, i) => i));
  });

  it("labels the chunk with the dominant speaker by characters", () => {
    const segs = [seg("A", "hi", 0, 1), seg("B", "this is a much longer turn by B", 1, 3)];
    const chunks = chunkTranscript(segs, { maxTokens: 500 });

    expect(chunks[0].speaker).toBe("B");
  });

  it("returns no chunks for empty input", () => {
    expect(chunkTranscript([])).toEqual([]);
  });
});
