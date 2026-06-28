// Speaker-turn-aware chunking for transcripts.
//
//   segments (per-utterance)        chunks (~maxTokens, ~overlap carried)
//   ┌─────────────┐                 ┌────────────────────────────┐
//   │ Sarah: ...  │ ─┐              │ Sarah: .. / Alex: .. / ..   │ seq 0
//   │ Alex:  ...  │  ├─ pack ─────▶ └────────────────────────────┘
//   │ Jordan: ... │ ─┘ until        ┌────────────────────────────┐
//   │ Sarah: ...  │    > maxTokens  │ <overlap> / Sarah: ..       │ seq 1
//   └─────────────┘                 └────────────────────────────┘
//
// Whole utterances are never split. Overlap re-includes trailing utterances of
// the previous chunk (~overlapTokens) so a decision straddling a boundary survives
// in both chunks.

export interface TranscriptSegment {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

export interface Chunk {
  seq: number;
  speaker: string; // speaker at the chunk's start (matches startS — see buildChunk)
  text: string; // speaker-labeled dialogue
  startS: number;
  endS: number;
}

export interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
}

// Dependency-free token estimate (~4 chars/token). Good enough for sizing chunks.
function estTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function buildChunk(seq: number, segs: TranscriptSegment[]): Chunk {
  const text = segs.map((s) => `${s.speaker}: ${s.text}`).join("\n");

  // A chunk usually spans several turns from different speakers (whole utterances
  // are never split). `speaker` is the ONE label a citation shows for the clip, and
  // the clip plays from `startS` = the first utterance's start — so the label must
  // be the FIRST utterance's speaker, the person heard at that timestamp. (An
  // earlier "dominant speaker by char count" disagreed with startS and mislabeled
  // clips, e.g. a clip that opens with A but is tagged B because B talked more.)
  return {
    seq,
    speaker: segs[0].speaker,
    text,
    startS: segs[0].start,
    endS: segs[segs.length - 1].end,
  };
}

// Trailing utterances of the previous chunk that sum to ~overlapTokens.
function overlapSegments(segs: TranscriptSegment[], overlapTokens: number): TranscriptSegment[] {
  const carried: TranscriptSegment[] = [];
  let tokens = 0;
  for (let i = segs.length - 1; i >= 0; i--) {
    const t = estTokens(segs[i].text);
    if (tokens + t > overlapTokens && carried.length > 0) break;
    carried.unshift(segs[i]);
    tokens += t;
  }
  return carried;
}

export function chunkTranscript(
  segments: TranscriptSegment[],
  options: ChunkOptions = {}
): Chunk[] {
  const maxTokens = options.maxTokens ?? 500;
  const overlapTokens = options.overlapTokens ?? 75;

  const chunks: Chunk[] = [];
  let current: TranscriptSegment[] = [];
  let currentTokens = 0;
  let seq = 0;

  for (const seg of segments) {
    const segTokens = estTokens(seg.text);
    if (current.length > 0 && currentTokens + segTokens > maxTokens) {
      chunks.push(buildChunk(seq++, current));
      const carry = overlapSegments(current, overlapTokens);
      current = [...carry];
      currentTokens = carry.reduce((n, s) => n + estTokens(s.text), 0);
    }
    current.push(seg);
    currentTokens += segTokens;
  }
  if (current.length > 0) {
    chunks.push(buildChunk(seq, current));
  }
  return chunks;
}
