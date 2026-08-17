
export interface TranscriptSegment {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

export interface Chunk {
  seq: number;
  speaker: string;
  text: string;
  startS: number;
  endS: number;
}

export interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
}

function estTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function buildChunk(seq: number, segs: TranscriptSegment[]): Chunk {
  const text = segs.map((s) => `${s.speaker}: ${s.text}`).join("\n");

  // The label must be the FIRST utterance's speaker, because the clip plays from
  // startS. Ranking by dominant-by-chars instead mislabels every clip that opens
  // with one speaker and is carried by another.
  return {
    seq,
    speaker: segs[0].speaker,
    text,
    startS: segs[0].start,
    endS: segs[segs.length - 1].end,
  };
}

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
