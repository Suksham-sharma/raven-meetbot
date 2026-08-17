import type { SpeakerTimeline } from "./speakerTimeline";

export interface DiarizedUtterance {
  start: number;
  end: number;
  transcript: string;
  speaker: number;
}

export interface NamedUtterance {
  speaker: string;
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export type AttributionMethod = "bind" | "elimination" | "unresolved";

export interface SpeakerAssignment {
  speaker: number;
  csrcId: number | null;
  name: string;
  method: AttributionMethod;
  mappingConfidence: number;
  utterances: number;
}

export interface MergeResult {
  named: NamedUtterance[];
  assignments: SpeakerAssignment[];
}

function levelMassInWindow(
  timeline: SpeakerTimeline,
  startMs: number,
  endMs: number
): Map<number, number> {
  const mass = new Map<number, number>();
  for (const s of timeline.csrc) {
    if (s.tEpochMs < startMs || s.tEpochMs > endMs) continue;
    mass.set(s.id, (mass.get(s.id) ?? 0) + s.lvl);
  }
  return mass;
}

function argmax(mass: Map<number, number>): { id: number; share: number } | null {
  let total = 0;
  let bestId = -1;
  let bestVal = -1;
  for (const [id, val] of mass) {
    total += val;
    if (val > bestVal) {
      bestVal = val;
      bestId = id;
    }
  }
  if (bestId === -1 || total === 0) return null;
  return { id: bestId, share: bestVal / total };
}

export function mergeNames(
  utterances: DiarizedUtterance[],
  timeline: SpeakerTimeline
): MergeResult {
  const recStart = timeline.recordingStartEpochMs;

  const perUtt = utterances.map((u) => {
    const mass = levelMassInWindow(
      timeline,
      recStart + u.start * 1000,
      recStart + u.end * 1000
    );
    return { u, mass, winner: argmax(mass) };
  });

  const labelMass = new Map<number, Map<number, number>>();
  const labelCount = new Map<number, number>();
  for (const { u, mass } of perUtt) {
    labelCount.set(u.speaker, (labelCount.get(u.speaker) ?? 0) + 1);
    const agg = labelMass.get(u.speaker) ?? new Map<number, number>();
    for (const [id, val] of mass) agg.set(id, (agg.get(id) ?? 0) + val);
    labelMass.set(u.speaker, agg);
  }

  const labels = [...labelCount.keys()].sort((a, b) => a - b);
  const assignments = new Map<number, SpeakerAssignment>();
  const usedNames = new Set<string>();

  for (const label of labels) {
    const dom = argmax(labelMass.get(label) ?? new Map());
    const csrcId = dom?.id ?? null;
    const bound = csrcId != null ? timeline.binds.get(csrcId) : undefined;
    assignments.set(label, {
      speaker: label,
      csrcId,
      name: bound ?? "",
      method: bound ? "bind" : "unresolved",
      mappingConfidence: dom?.share ?? 0,
      utterances: labelCount.get(label) ?? 0,
    });
    if (bound) usedNames.add(bound);
  }

  const remainingNames = timeline.participants.filter((n) => !usedNames.has(n));
  let ri = 0;
  for (const label of labels) {
    const a = assignments.get(label)!;
    if (a.name) continue;
    if (ri < remainingNames.length) {
      a.name = remainingNames[ri++];
      a.method = "elimination";
    } else {
      a.name = `Speaker ${label}`;
      a.method = "unresolved";
    }
  }

  const named: NamedUtterance[] = perUtt.map(({ u, mass }) => {
    const a = assignments.get(u.speaker)!;
    let total = 0;
    let onAssigned = 0;
    for (const [id, val] of mass) {
      total += val;
      if (id === a.csrcId) onAssigned += val;
    }
    return {
      speaker: a.name,
      start: u.start,
      end: u.end,
      text: u.transcript,
      confidence: total > 0 ? Number((onAssigned / total).toFixed(3)) : 0,
    };
  });

  return { named, assignments: [...assignments.values()] };
}
