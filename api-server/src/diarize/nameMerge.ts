import type { SpeakerTimeline } from "./speakerTimeline";

// Interval-vote join: map Deepgram's anonymous diarization labels (Speaker 0/1/2)
// to real names, using the CSRC speaker timeline as the bridge.
//
// Deepgram says WHEN each anonymous speaker talked (seconds from audio t=0); the
// timeline says WHICH contributor id was active at each epoch-ms and (via the bind)
// what one of them is named. Aligning the two on a shared clock (recordingStartEpochMs)
// lets each diarization label vote, across all its utterances, for the contributor
// it overlaps most — then bind/elimination turns that contributor into a name.
//
// Pure + IO-free so the join is unit-testable on synthetic timelines.

export interface DiarizedUtterance {
  start: number; // seconds from audio t=0
  end: number;
  transcript: string;
  speaker: number; // Deepgram diarization label
}

export interface NamedUtterance {
  speaker: string;
  start: number;
  end: number;
  text: string;
  confidence: number; // 0–1: this window's level mass on the assigned contributor
}

export type AttributionMethod = "bind" | "elimination" | "unresolved";

export interface SpeakerAssignment {
  speaker: number; // Deepgram label
  csrcId: number | null; // contributor it voted for (null if no overlap at all)
  name: string;
  method: AttributionMethod;
  mappingConfidence: number; // 0–1: share of the label's total level mass on csrcId
  utterances: number;
}

export interface MergeResult {
  named: NamedUtterance[];
  assignments: SpeakerAssignment[];
}

// Sum CSRC level mass per contributor id within [startMs, endMs].
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

  // 1. Per utterance, find the contributor with the most level mass in its window.
  const perUtt = utterances.map((u) => {
    const mass = levelMassInWindow(
      timeline,
      recStart + u.start * 1000,
      recStart + u.end * 1000
    );
    return { u, mass, winner: argmax(mass) };
  });

  // 2. Aggregate each Deepgram label's level mass per contributor → its dominant id.
  const labelMass = new Map<number, Map<number, number>>();
  const labelCount = new Map<number, number>();
  for (const { u, mass } of perUtt) {
    labelCount.set(u.speaker, (labelCount.get(u.speaker) ?? 0) + 1);
    const agg = labelMass.get(u.speaker) ?? new Map<number, number>();
    for (const [id, val] of mass) agg.set(id, (agg.get(id) ?? 0) + val);
    labelMass.set(u.speaker, agg);
  }

  // 3. Resolve each label → contributor → name. Bind first (high confidence), then
  //    name the rest by elimination from the remaining participant names.
  const labels = [...labelCount.keys()].sort((a, b) => a - b);
  const assignments = new Map<number, SpeakerAssignment>();
  const usedNames = new Set<string>();

  // First pass: bind-backed assignments.
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

  // Second pass: elimination for the still-unnamed, drawing from participants not
  // already claimed by a bind.
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

  // 4. Emit named utterances. Per-utterance confidence = the share of that window's
  //    level mass on the contributor the label was assigned (0 if the window had no
  //    CSRC samples or it disagreed with the label's dominant contributor).
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
