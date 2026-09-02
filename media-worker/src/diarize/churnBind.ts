import type { SpeakerTimeline, TileSpan } from "./speakerTimeline";

export interface ChurnBind {
  csrcId: number;
  pid: string;
  name: string;
  phi: number;
  hotTicks: number;
  runnerUpPhi: number;
}

export interface ChurnBindOptions {
  tickMs?: number;
  minPhi?: number;
  minHotTicks?: number;
  minMargin?: number;
}

const DEFAULTS: Required<ChurnBindOptions> = {
  tickMs: 250,
  minPhi: 0.4,
  minHotTicks: 20,
  minMargin: 0.15,
};

interface Contingency {
  hotChurn: number;
  hotQuiet: number;
  coldChurn: number;
  coldQuiet: number;
}

function phi(c: Contingency): number {
  const { hotChurn: a, hotQuiet: b, coldChurn: c2, coldQuiet: d } = c;
  const denom = Math.sqrt((a + b) * (c2 + d) * (a + c2) * (b + d));
  if (denom === 0) return 0;
  return (a * d - b * c2) / denom;
}

function hotIdsPerTick(timeline: SpeakerTimeline, gridStartMs: number, tickMs: number, ticks: number): Set<number>[] {
  const out: Set<number>[] = Array.from({ length: ticks }, () => new Set<number>());
  for (const s of timeline.csrc) {
    const i = Math.round((s.tEpochMs - gridStartMs) / tickMs);
    if (i >= 0 && i < ticks) out[i].add(s.id);
  }
  return out;
}

function churningPidsPerTick(timeline: SpeakerTimeline, gridStartMs: number, tickMs: number, ticks: number): Set<string>[] {
  const out: Set<string>[] = Array.from({ length: ticks }, () => new Set<string>());
  for (const iv of timeline.churn) {
    if (iv.pids.length === 0) continue;
    const from = Math.max(0, Math.ceil((iv.fromMs - gridStartMs) / tickMs));
    const to = Math.min(ticks - 1, Math.floor((iv.toMs - gridStartMs) / tickMs));
    for (let i = from; i <= to; i++) for (const pid of iv.pids) out[i].add(pid);
  }
  return out;
}

function candidateTiles(timeline: SpeakerTimeline): TileSpan[] {
  return timeline.tiles.filter((t) => t.name && !t.presentation);
}

export function bindFromChurn(timeline: SpeakerTimeline, options: ChurnBindOptions = {}): ChurnBind[] {
  const opts = { ...DEFAULTS, ...options };
  if (timeline.churn.length === 0 || timeline.csrc.length === 0) return [];

  const gridStartMs = Math.min(timeline.csrc[0].tEpochMs, timeline.churn[0].fromMs);
  const gridEndMs = Math.max(
    timeline.csrc[timeline.csrc.length - 1].tEpochMs,
    timeline.churn[timeline.churn.length - 1].toMs
  );
  const ticks = Math.floor((gridEndMs - gridStartMs) / opts.tickMs) + 1;
  const hot = hotIdsPerTick(timeline, gridStartMs, opts.tickMs, ticks);
  const churning = churningPidsPerTick(timeline, gridStartMs, opts.tickMs, ticks);
  const tiles = candidateTiles(timeline);
  const csrcIds = [...new Set(timeline.csrc.map((s) => s.id))];

  const table = new Map<number, Map<string, Contingency>>();
  for (const id of csrcIds) {
    const row = new Map<string, Contingency>();
    for (const t of tiles) row.set(t.pid, { hotChurn: 0, hotQuiet: 0, coldChurn: 0, coldQuiet: 0 });
    table.set(id, row);
  }

  for (let i = 0; i < ticks; i++) {
    for (const id of csrcIds) {
      const isHot = hot[i].has(id);
      const row = table.get(id)!;
      for (const t of tiles) {
        const present = t.firstSeenMs <= gridStartMs + i * opts.tickMs && gridStartMs + i * opts.tickMs <= t.lastSeenMs;
        if (!present) continue;
        const c = row.get(t.pid)!;
        const isChurn = churning[i].has(t.pid);
        if (isHot && isChurn) c.hotChurn++;
        else if (isHot) c.hotQuiet++;
        else if (isChurn) c.coldChurn++;
        else c.coldQuiet++;
      }
    }
  }

  const scored: ChurnBind[] = [];
  for (const id of csrcIds) {
    const ranked = [...table.get(id)!.entries()]
      .map(([pid, c]) => ({ pid, phi: phi(c), hotTicks: c.hotChurn + c.hotQuiet }))
      .sort((a, b) => b.phi - a.phi);
    const lead = ranked[0];
    if (!lead) continue;
    const runnerUp = ranked[1]?.phi ?? 0;
    if (lead.phi < opts.minPhi) continue;
    if (lead.hotTicks < opts.minHotTicks) continue;
    if (lead.phi - runnerUp < opts.minMargin) continue;
    scored.push({
      csrcId: id,
      pid: lead.pid,
      name: tiles.find((t) => t.pid === lead.pid)!.name,
      phi: Number(lead.phi.toFixed(3)),
      hotTicks: lead.hotTicks,
      runnerUpPhi: Number(runnerUp.toFixed(3)),
    });
  }

  const usedTiles = new Set<string>();
  const out: ChurnBind[] = [];
  for (const b of scored.sort((a, b) => b.phi - a.phi)) {
    if (usedTiles.has(b.pid)) continue;
    usedTiles.add(b.pid);
    out.push(b);
  }
  return out.sort((a, b) => a.csrcId - b.csrcId);
}
