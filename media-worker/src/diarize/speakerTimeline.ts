import { readFileSync } from "fs";

export interface CsrcSample {
  tEpochMs: number;
  id: number;
  lvl: number;
}

export interface TileSpan {
  pid: string;
  name: string;
  presentation: boolean;
  firstSeenMs: number;
  lastSeenMs: number;
}

export interface ChurnInterval {
  fromMs: number;
  toMs: number;
  pids: string[];
}

export interface SpeakerTimeline {
  recordingStartEpochMs: number;
  csrc: CsrcSample[];
  binds: Map<number, string>;
  tiles: TileSpan[];
  churn: ChurnInterval[];
  churnBinds?: Map<number, string>;
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

const PRESENTATION_SUFFIX = /\((presentation|présentation|präsentation|presentación)\)\s*$/i;

export function isPresentationName(name: string): boolean {
  return PRESENTATION_SUFFIX.test(name.trim());
}

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
  const openTiles = new Map<string, TileSpan>();
  const closedTiles: TileSpan[] = [];
  const churn: ChurnInterval[] = [];
  let lastEventMs = 0;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const e = JSON.parse(line) as Record<string, unknown>;
    const t = typeof e.t === "number" ? e.t : 0;
    if (t > lastEventMs) lastEventMs = t;
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
          csrc.push({ tEpochMs: t, id: en.id, lvl: en.lvl });
        }
        break;
      }
      case "bind": {
        const names = cleanTileNames(Array.isArray(e.names) ? (e.names as string[]) : []);
        const name = names.find((n) => !isPresentationName(n));
        if (typeof e.id === "number" && name) binds.set(e.id, name);
        break;
      }
      case "tile": {
        const pid = typeof e.pid === "string" ? e.pid : "";
        if (!pid) break;
        const names = cleanTileNames(Array.isArray(e.names) ? (e.names as string[]) : []);
        const span = openTiles.get(pid) ?? {
          pid,
          name: "",
          presentation: false,
          firstSeenMs: t,
          lastSeenMs: t,
        };
        if (names.length > 0 && !span.name) span.name = names[0];
        if (names.some(isPresentationName)) span.presentation = true;
        span.lastSeenMs = t;
        openTiles.set(pid, span);
        break;
      }
      case "tile-": {
        const pid = typeof e.pid === "string" ? e.pid : "";
        const span = openTiles.get(pid);
        if (!span) break;
        span.lastSeenMs = t;
        openTiles.delete(pid);
        closedTiles.push(span);
        break;
      }
      case "churn": {
        const pids = Array.isArray(e.pids) ? (e.pids as unknown[]).filter((x): x is string => typeof x === "string") : [];
        const prev = churn[churn.length - 1];
        if (prev) prev.toMs = t;
        churn.push({ fromMs: t, toMs: t, pids });
        break;
      }
    }
  }

  if (recordingStartEpochMs === 0) {
    throw new Error(`speakers.jsonl ${path}: no meta.recordingStartEpochMs`);
  }

  for (const span of openTiles.values()) {
    span.lastSeenMs = lastEventMs;
    closedTiles.push(span);
  }
  const lastChurn = churn[churn.length - 1];
  if (lastChurn) lastChurn.toMs = lastEventMs;
  const tiles = closedTiles.sort((a, b) => a.firstSeenMs - b.firstSeenMs);

  const participantSet = new Set<string>();
  for (const span of tiles) {
    if (span.name && !span.presentation) participantSet.add(span.name);
  }

  return {
    recordingStartEpochMs,
    csrc,
    binds,
    tiles,
    churn,
    participants: [...participantSet],
  };
}
