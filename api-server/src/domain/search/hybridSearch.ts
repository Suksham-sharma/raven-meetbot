import { sql, type SQL } from "drizzle-orm";
import { db } from "../../platform/db/client";
import { openaiProvider } from "../../platform/llm/openai";
import type { EmbeddingProvider } from "../../platform/llm/provider";

export interface SearchFilters {
  ownerId?: string;
  meetingId?: string;
  meetingType?: string;
  participant?: string;
  speaker?: string;
  from?: Date;
  to?: Date;
}

export interface SearchHit {
  chunkId: number;
  meetingId: string;
  meetingTitle: string | null;
  meetingType: string | null;
  meetingDate: Date | null;
  seq: number;
  speaker: string | null;
  text: string;
  startS: number;
  endS: number;
  recordingOffsetS: number;
  vecRank: number | null;
  ftsRank: number | null;
  score: number;
}

export interface HybridSearchOptions {
  k?: number;
  filters?: SearchFilters;
  rrfK?: number;
  embedder?: EmbeddingProvider;
}

function buildFilterConds(filters?: SearchFilters): SQL[] {
  const conds: SQL[] = [];
  if (!filters) return conds;
  if (filters.ownerId) conds.push(sql`m.owner_id = ${filters.ownerId}`);
  if (filters.meetingId) conds.push(sql`c.meeting_id = ${filters.meetingId}`);
  if (filters.meetingType) conds.push(sql`m.type = ${filters.meetingType}`);
  if (filters.from) conds.push(sql`m.started_at >= ${filters.from.toISOString()}`);
  if (filters.to) conds.push(sql`m.started_at <= ${filters.to.toISOString()}`);
  if (filters.participant) {
    conds.push(sql`m.participants @> ${JSON.stringify([filters.participant])}::jsonb`);
  }
  if (filters.speaker) {
    conds.push(sql`c.speaker ILIKE ${`%${filters.speaker}%`}`);
  }
  return conds;
}

export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {}
): Promise<SearchHit[]> {
  const k = options.k ?? 8;
  const rrfK = options.rrfK ?? 60;
  const embedder = options.embedder ?? openaiProvider;
  const inner = Math.max(k * 5, 50);

  const [embedding] = await embedder.embed([query]);
  const vecLiteral = `[${embedding.join(",")}]`;

  const base = buildFilterConds(options.filters);
  const andBase = base.length ? sql` AND ${sql.join(base, sql` AND `)}` : sql``;

  const result = await db.execute(sql`
    WITH q AS (
      SELECT ${vecLiteral}::vector(1536) AS qe,
             -- websearch_to_tsquery ANDs every lexeme, which never matches a
             -- natural-language question against a short chunk. OR the lexemes
             -- (it still stems + drops stopwords); ts_rank_cd then ranks a chunk
             -- higher the more query terms it contains.
             replace(
               websearch_to_tsquery('english', ${query})::text, '&', '|'
             )::tsquery AS qq
    ),
    vec AS (
      SELECT c.id,
             row_number() OVER (ORDER BY c.embedding <=> (SELECT qe FROM q)) AS rnk
      FROM chunks c
      JOIN meetings m ON m.id = c.meeting_id
      WHERE c.embedding IS NOT NULL${andBase}
      ORDER BY c.embedding <=> (SELECT qe FROM q)
      LIMIT ${inner}
    ),
    fts AS (
      SELECT c.id,
             row_number() OVER (
               ORDER BY ts_rank_cd(c.tsv, (SELECT qq FROM q)) DESC
             ) AS rnk
      FROM chunks c
      JOIN meetings m ON m.id = c.meeting_id
      WHERE c.tsv @@ (SELECT qq FROM q)${andBase}
      ORDER BY ts_rank_cd(c.tsv, (SELECT qq FROM q)) DESC
      LIMIT ${inner}
    )
    SELECT c.id                  AS "chunkId",
           c.meeting_id          AS "meetingId",
           m.title               AS "meetingTitle",
           m.type                AS "meetingType",
           m.started_at          AS "meetingDate",
           c.seq                 AS "seq",
           c.speaker             AS "speaker",
           c.text                AS "text",
           c.start_s             AS "startS",
           c.end_s               AS "endS",
           m.recording_offset_s  AS "recordingOffsetS",
           vec.rnk               AS "vecRank",
           fts.rnk               AS "ftsRank",
           coalesce(1.0 / (${rrfK} + vec.rnk), 0)
             + coalesce(1.0 / (${rrfK} + fts.rnk), 0) AS "score"
    FROM chunks c
    JOIN meetings m ON m.id = c.meeting_id
    LEFT JOIN vec ON vec.id = c.id
    LEFT JOIN fts ON fts.id = c.id
    WHERE vec.id IS NOT NULL OR fts.id IS NOT NULL
    ORDER BY "score" DESC
    LIMIT ${k}
  `);

  const rows = (result as unknown as { rows: Record<string, unknown>[] }).rows;
  return rows.map((r) => ({
    chunkId: Number(r.chunkId),
    meetingId: String(r.meetingId),
    meetingTitle: r.meetingTitle as string | null,
    meetingType: r.meetingType as string | null,
    meetingDate: r.meetingDate ? new Date(r.meetingDate as string) : null,
    seq: Number(r.seq),
    speaker: r.speaker as string | null,
    text: String(r.text),
    startS: Number(r.startS),
    endS: Number(r.endS),
    recordingOffsetS: Number(r.recordingOffsetS),
    vecRank: r.vecRank == null ? null : Number(r.vecRank),
    ftsRank: r.ftsRank == null ? null : Number(r.ftsRank),
    score: Number(r.score),
  }));
}
