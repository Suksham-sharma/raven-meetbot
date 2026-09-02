import { describe, expect, it } from "vitest";
import { bindFromChurn } from "./churnBind";
import type { ChurnInterval, CsrcSample, SpeakerTimeline, TileSpan } from "./speakerTimeline";

const T0 = 1_000_000;
const ALICE = 5001;
const BOB = 6002;

const tile = (pid: string, name: string, firstS: number, lastS: number, presentation = false): TileSpan => ({
  pid,
  name,
  presentation,
  firstSeenMs: T0 + firstS * 1000,
  lastSeenMs: T0 + lastS * 1000,
});

interface Turn {
  id: number;
  pid: string;
  fromS: number;
  toS: number;
}

function conversation(turns: Turn[], opts: { alwaysChurning?: string[]; lagMs?: number } = {}) {
  const lag = opts.lagMs ?? 0;
  const csrc: CsrcSample[] = [];
  const edges: { t: number; pid: string; on: boolean }[] = [];
  for (const turn of turns) {
    for (let t = T0 + turn.fromS * 1000; t < T0 + turn.toS * 1000; t += 250) {
      csrc.push({ tEpochMs: t, id: turn.id, lvl: 0.3 });
    }
    edges.push({ t: T0 + turn.fromS * 1000, pid: turn.pid, on: true });
    edges.push({ t: T0 + turn.toS * 1000 + lag, pid: turn.pid, on: false });
  }
  edges.sort((a, b) => a.t - b.t);
  const active = new Set<string>(opts.alwaysChurning ?? []);
  const churn: ChurnInterval[] = [{ fromMs: T0, toMs: T0, pids: [...active] }];
  for (const e of edges) {
    if (e.on) active.add(e.pid);
    else active.delete(e.pid);
    churn[churn.length - 1].toMs = e.t;
    churn.push({ fromMs: e.t, toMs: e.t, pids: [...active] });
  }
  churn[churn.length - 1].toMs = T0 + 120_000;
  csrc.sort((a, b) => a.tEpochMs - b.tEpochMs);
  return { csrc, churn };
}

function timeline(parts: Partial<SpeakerTimeline>): SpeakerTimeline {
  return {
    recordingStartEpochMs: T0,
    csrc: [],
    binds: new Map(),
    tiles: [],
    churn: [],
    participants: [],
    ...parts,
  };
}

const turnTaking: Turn[] = [];
for (let s = 0; s < 120; s += 12) {
  turnTaking.push({ id: ALICE, pid: "p-alice", fromS: s, toS: s + 6 });
  turnTaking.push({ id: BOB, pid: "p-bob", fromS: s + 6, toS: s + 12 });
}

describe("bindFromChurn", () => {
  it("binds both speakers of a turn-taking conversation", () => {
    const tiles = [tile("p-bot", "", 0, 120), tile("p-alice", "Alice", 0, 120), tile("p-bob", "Bob", 0, 120)];
    const tl = timeline({ tiles, ...conversation(turnTaking) });

    const binds = bindFromChurn(tl);
    expect(binds.map((b) => [b.csrcId, b.name])).toEqual([
      [ALICE, "Alice"],
      [BOB, "Bob"],
    ]);
    expect(binds.every((b) => b.phi > 0.9)).toBe(true);
  });

  it("still binds when the previous speaker's indicator lingers into the next turn", () => {
    const tiles = [tile("p-alice", "Alice", 0, 120), tile("p-bob", "Bob", 0, 120)];
    const tl = timeline({ tiles, ...conversation(turnTaking, { lagMs: 2000 }) });

    const binds = bindFromChurn(tl);
    expect(binds.map((b) => b.name)).toEqual(["Alice", "Bob"]);
  });

  it("ignores a tile that churns the whole meeting", () => {
    const tiles = [tile("p-noisy", "Carol", 0, 120), tile("p-alice", "Alice", 0, 120), tile("p-bob", "Bob", 0, 120)];
    const tl = timeline({ tiles, ...conversation(turnTaking, { alwaysChurning: ["p-noisy"] }) });

    const binds = bindFromChurn(tl);
    expect(binds.map((b) => b.name)).toEqual(["Alice", "Bob"]);
  });

  it("never binds onto a presentation tile", () => {
    const tiles = [tile("p-share", "Alice (Presentation)", 0, 120, true), tile("p-bob", "Bob", 0, 120)];
    const only: Turn[] = turnTaking.map((t) => (t.id === ALICE ? { ...t, pid: "p-share" } : t));
    const tl = timeline({ tiles, ...conversation(only) });

    const binds = bindFromChurn(tl);
    expect(binds.map((b) => b.name)).toEqual(["Bob"]);
  });

  it("refuses to bind on too little speech", () => {
    const tiles = [tile("p-alice", "Alice", 0, 120), tile("p-bob", "Bob", 0, 120)];
    const brief: Turn[] = [
      { id: ALICE, pid: "p-alice", fromS: 0, toS: 3 },
      { id: BOB, pid: "p-bob", fromS: 10, toS: 60 },
    ];
    const tl = timeline({ tiles, ...conversation(brief) });

    const binds = bindFromChurn(tl);
    expect(binds.map((b) => b.name)).toEqual(["Bob"]);
  });

  it("refuses to bind when the indicator does not follow the audio", () => {
    const tiles = [tile("p-alice", "Alice", 0, 120), tile("p-bob", "Bob", 0, 120)];
    const { csrc } = conversation(turnTaking);
    const churn: ChurnInterval[] = [];
    for (let s = 0; s < 120; s += 7) {
      churn.push({ fromMs: T0 + s * 1000, toMs: T0 + (s + 3) * 1000, pids: ["p-alice"] });
      churn.push({ fromMs: T0 + (s + 3) * 1000, toMs: T0 + (s + 7) * 1000, pids: ["p-bob"] });
    }
    const tl = timeline({ tiles, csrc, churn });

    expect(bindFromChurn(tl)).toEqual([]);
  });

  it("returns nothing for an artifact recorded before churn logging existed", () => {
    const tiles = [tile("p-alice", "Alice", 0, 120)];
    const { csrc } = conversation(turnTaking);
    expect(bindFromChurn(timeline({ tiles, csrc }))).toEqual([]);
  });

  it("gives one tile to at most one source", () => {
    const tiles = [tile("p-alice", "Alice", 0, 120)];
    const both: Turn[] = turnTaking.map((t) => ({ ...t, pid: "p-alice" }));
    const tl = timeline({ tiles, ...conversation(both) });

    const binds = bindFromChurn(tl);
    expect(binds.length).toBeLessThanOrEqual(1);
  });
});
