import { readFileSync } from "fs";

export interface CsrcSample {
  tEpochMs: number;
  id: number;
  lvl: number;
}

export interface SpeakerTimeline {
  recordingStartEpochMs: number;
  csrc: CsrcSample[];
  binds: Map<number, string>;
  participants: string[];
}

const TILE_NOISE = new Set([
  "devices",
  "names",
  "shadow note",
  "backgrounds and effects",
  "enter full screen",
  "open in new window",
  "remove this tile",
  "show in a tile",
  "zoom in",
  "pin",
  "unpin",
  "mute",
]);

export function cleanTileNames(raw: string[]): string[] {
  const out: string[] = [];
  for (const n of raw) {
    const name = n.trim();
    const lc = name.toLowerCase();
    if (!name) continue;
    if (TILE_NOISE.has(lc)) continue;
    if (lc.startsWith("more options for ")) continue;
    out.push(name);
  }
  return out;
}

const MIN_REAL_CSRC_ID = 1000;

export function parseSpeakerTimeline(path: string): SpeakerTimeline {
  let recordingStartEpochMs = 0;
  const csrc: CsrcSample[] = [];
  const binds = new Map<number, string>();
  const participantSet = new Set<string>();

  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const e = JSON.parse(line) as Record<string, unknown>;
    switch (e.type) {
      case "meta":
        if (typeof e.recordingStartEpochMs === "number") {
          recordingStartEpochMs = e.recordingStartEpochMs;
        }
        break;
      case "csrc": {
        const entries = Array.isArray(e.entries) ? e.entries : [];
        for (const raw of entries) {
          const en = raw as Record<string, unknown>;
          if (typeof en.id !== "number" || typeof en.lvl !== "number") continue;
          if (en.id < MIN_REAL_CSRC_ID) continue;
          csrc.push({ tEpochMs: e.t as number, id: en.id, lvl: en.lvl });
        }
        break;
      }
      case "bind": {
        const names = cleanTileNames(Array.isArray(e.names) ? (e.names as string[]) : []);
        if (typeof e.id === "number" && names.length > 0) {
          binds.set(e.id, names[0]);
        }
        break;
      }
      case "tile": {
        for (const n of cleanTileNames(Array.isArray(e.names) ? (e.names as string[]) : [])) {
          participantSet.add(n);
        }
        break;
      }
    }
  }

  if (recordingStartEpochMs === 0) {
    throw new Error(`speakers.jsonl ${path}: no meta.recordingStartEpochMs`);
  }

  return {
    recordingStartEpochMs,
    csrc,
    binds,
    participants: [...participantSet],
  };
}
