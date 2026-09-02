import { describe, expect, it } from "vitest";
import { mergeNames, type DiarizedUtterance } from "./nameMerge";
import type { CsrcSample, SpeakerTimeline, TileSpan } from "./speakerTimeline";

const REC_START = 1_000_000;

const tile = (
  pid: string,
  name: string,
  firstS: number,
  lastS: number,
  presentation = false
): TileSpan => ({
  pid,
  name,
  presentation,
  firstSeenMs: REC_START + firstS * 1000,
  lastSeenMs: REC_START + lastS * 1000,
});

function timeline(overrides: Partial<SpeakerTimeline> = {}): SpeakerTimeline {
  const csrc: CsrcSample[] = [];
  for (let s = 0; s < 10; s++) csrc.push({ tEpochMs: REC_START + s * 1000, id: 5001, lvl: 0.5 });
  for (let s = 10; s < 20; s++) csrc.push({ tEpochMs: REC_START + s * 1000, id: 6002, lvl: 0.5 });
  const tiles = [tile("p-alice", "Alice", 0, 20), tile("p-bob", "Bob", 0, 20)];
  return {
    recordingStartEpochMs: REC_START,
    csrc,
    binds: new Map([[5001, "Alice"]]),
    tiles,
    participants: tiles.map((t) => t.name),
    ...overrides,
  };
}

const utt = (speaker: number, start: number, end: number, transcript = "…"): DiarizedUtterance => ({
  speaker,
  start,
  end,
  transcript,
});

describe("mergeNames", () => {
  it("names a bound speaker via the bind and the other by elimination", () => {
    const utterances = [utt(0, 1, 5), utt(0, 6, 9), utt(1, 11, 15)];
    const { named, assignments } = mergeNames(utterances, timeline());

    const a0 = assignments.find((a) => a.speaker === 0)!;
    const a1 = assignments.find((a) => a.speaker === 1)!;
    expect(a0).toMatchObject({ name: "Alice", method: "bind", csrcId: 5001 });
    expect(a1).toMatchObject({ name: "Bob", method: "elimination", csrcId: 6002 });

    expect(named.map((n) => n.speaker)).toEqual(["Alice", "Alice", "Bob"]);
    expect(named.every((n) => n.confidence === 1)).toBe(true);
  });

  it("never eliminates onto a presentation tile, even when it was seen first", () => {
    const tiles = [
      tile("p-share", "Alice (Presentation)", 0, 20, true),
      tile("p-alice", "Alice", 0, 20),
      tile("p-bob", "Bob", 0, 20),
    ];
    const tl = timeline({ tiles, participants: ["Alice", "Bob"] });
    const { assignments } = mergeNames([utt(0, 1, 5), utt(1, 11, 15)], tl);

    expect(assignments.find((a) => a.speaker === 1)!).toMatchObject({
      name: "Bob",
      method: "elimination",
    });
  });

  it("eliminates onto the tile that was present while the speaker talked", () => {
    const tiles = [
      tile("p-carol", "Carol", 0, 4),
      tile("p-alice", "Alice", 0, 20),
      tile("p-bob", "Bob", 8, 20),
    ];
    const tl = timeline({ tiles, participants: ["Carol", "Alice", "Bob"] });
    const { assignments } = mergeNames([utt(0, 1, 5), utt(1, 11, 15)], tl);

    expect(assignments.find((a) => a.speaker === 1)!.name).toBe("Bob");
  });

  it("falls back to Speaker N when no human tile overlaps the speech", () => {
    const tiles = [tile("p-alice", "Alice", 0, 20), tile("p-bob", "Bob", 0, 5)];
    const tl = timeline({ tiles, participants: ["Alice", "Bob"] });
    const { assignments } = mergeNames([utt(0, 1, 5), utt(1, 11, 15)], tl);

    expect(assignments.find((a) => a.speaker === 1)!).toMatchObject({
      name: "Speaker 1",
      method: "unresolved",
    });
  });

  it("does not hand the same tile to two unbound labels", () => {
    const tiles = [tile("p-alice", "Alice", 0, 20), tile("p-bob", "Bob", 0, 20)];
    const tl = timeline({ tiles, binds: new Map(), participants: ["Alice", "Bob"] });
    const { assignments } = mergeNames([utt(0, 1, 5), utt(1, 11, 15), utt(2, 16, 19)], tl);

    const names = assignments.map((a) => a.name);
    expect(new Set(names).size).toBe(3);
    expect(names).toContain("Speaker 2");
  });

  it("gives zero confidence when an utterance window has no CSRC overlap", () => {
    const { named } = mergeNames([utt(0, 100, 105)], timeline());
    expect(named[0].confidence).toBe(0);
  });
});
