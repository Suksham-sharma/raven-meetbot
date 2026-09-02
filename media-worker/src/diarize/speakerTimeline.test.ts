import { mkdtempSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { mergeNames } from "./nameMerge";
import { parseSpeakerTimeline } from "./speakerTimeline";

const T0 = 1_788_352_170_929;
const SUKSHAM = 3_809_515_420;
const ANKUR = 2_030_170_003;

function writeFixture(): string {
  const lines: Record<string, unknown>[] = [
    { type: "meta", t: T0 + 600, recordingStartEpochMs: T0 },
    { type: "tile", t: T0 + 800, pid: "d/565", names: ["devices", "shadow note", "Backgrounds and effects"] },
    { type: "tile", t: T0 + 10_400, pid: "d/564", names: ["devices", "Suksham (Presentation)", "More options for Suksham"] },
    { type: "tile", t: T0 + 10_400, pid: "d/562", names: ["Suksham", "devices", "More options for Suksham"] },
    { type: "tile", t: T0 + 10_400, pid: "d/563", names: ["devices", "Ankur Singh", "More options for Ankur Singh"] },
    { type: "tile", t: T0 + 11_300, pid: "d/564", names: ["Zoom in", "Enter Full Screen", "Open in new window"] },
    { type: "bind", t: T0 + 22_300, id: SUKSHAM, kind: "csrc", pid: "d/562", names: ["Suksham", "devices"] },
    { type: "tile-", t: T0 + 31_700, pid: "d/564" },
  ];
  for (let s = 14; s < 30; s++) lines.push({ type: "csrc", t: T0 + s * 1000, entries: [{ id: SUKSHAM, lvl: 0.3, kind: "csrc" }] });
  for (let s = 35; s < 540; s += 5) lines.push({ type: "csrc", t: T0 + s * 1000, entries: [{ id: ANKUR, lvl: 0.3, kind: "csrc" }] });
  lines.push({ type: "churn", t: T0 + 14_000, pids: ["d/562"] });
  lines.push({ type: "churn", t: T0 + 30_000, pids: [] });
  lines.push({ type: "churn", t: T0 + 35_000, pids: ["d/563"] });
  lines.push({ type: "end", t: T0 + 618_000, bindings: [{ id: SUKSHAM, pid: "d/562", names: [] }] });

  const dir = mkdtempSync(path.join(os.tmpdir(), "speakers-"));
  const file = path.join(dir, "fixture.speakers.jsonl");
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
}

describe("parseSpeakerTimeline", () => {
  it("keeps presentation tiles out of the participant roster and off the elimination path", () => {
    const tl = parseSpeakerTimeline(writeFixture());

    expect(tl.participants).toEqual(["Suksham", "Ankur Singh"]);
    expect(tl.binds.get(SUKSHAM)).toBe("Suksham");

    const share = tl.tiles.find((t) => t.pid === "d/564")!;
    expect(share).toMatchObject({ name: "Suksham (Presentation)", presentation: true });
    expect(share.lastSeenMs).toBe(T0 + 31_700);

    const ankur = tl.tiles.find((t) => t.pid === "d/563")!;
    expect(ankur.lastSeenMs).toBe(T0 + 618_000);

    expect(tl.churn).toEqual([
      { fromMs: T0 + 14_000, toMs: T0 + 30_000, pids: ["d/562"] },
      { fromMs: T0 + 30_000, toMs: T0 + 35_000, pids: [] },
      { fromMs: T0 + 35_000, toMs: T0 + 618_000, pids: ["d/563"] },
    ]);

    const utterances = [
      { speaker: 0, start: 15, end: 20, transcript: "hello" },
      { speaker: 1, start: 36, end: 40, transcript: "how are you" },
      { speaker: 1, start: 300, end: 310, transcript: "still me" },
    ];
    const { assignments } = mergeNames(utterances, tl);
    expect(assignments.find((a) => a.speaker === 0)!).toMatchObject({ name: "Suksham", method: "bind" });
    expect(assignments.find((a) => a.speaker === 1)!).toMatchObject({
      name: "Ankur Singh",
      method: "elimination",
      csrcId: ANKUR,
    });
  });
});
