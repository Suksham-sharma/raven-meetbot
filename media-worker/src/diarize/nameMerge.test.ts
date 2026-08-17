import { describe, expect, it } from "vitest";
import { mergeNames, type DiarizedUtterance } from "./nameMerge";
import type { CsrcSample, SpeakerTimeline } from "./speakerTimeline";

const REC_START = 1_000_000;

function timeline(overrides: Partial<SpeakerTimeline> = {}): SpeakerTimeline {
  const csrc: CsrcSample[] = [];
  for (let s = 0; s < 10; s++) csrc.push({ tEpochMs: REC_START + s * 1000, id: 5001, lvl: 0.5 });
  for (let s = 10; s < 20; s++) csrc.push({ tEpochMs: REC_START + s * 1000, id: 6002, lvl: 0.5 });
  return {
    recordingStartEpochMs: REC_START,
    csrc,
    binds: new Map([[5001, "Alice"]]),
    participants: ["Alice", "Bob"],
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

  it("falls back to Speaker N when no participant name is left", () => {
    const utterances = [utt(0, 1, 5), utt(1, 11, 15)];
    const tl = timeline({ binds: new Map(), participants: ["Bob"] });
    const { assignments } = mergeNames(utterances, tl);

    expect(assignments.find((a) => a.speaker === 0)!.name).toBe("Bob");
    expect(assignments.find((a) => a.speaker === 1)!).toMatchObject({
      name: "Speaker 1",
      method: "unresolved",
    });
  });

  it("gives zero confidence when an utterance window has no CSRC overlap", () => {
    const { named } = mergeNames([utt(0, 100, 105)], timeline());
    expect(named[0].confidence).toBe(0);
  });
});
