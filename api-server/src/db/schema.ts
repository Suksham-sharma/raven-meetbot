import { sql } from "drizzle-orm";
import {
  bigserial,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

// pgvector ships no Drizzle-native tsvector type; declare a minimal one.
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// One row per recorded meeting. id matches the meetingId used in R2 keys and the status API.
export const meetings = pgTable(
  "meetings",
  {
    id: text("id").primaryKey(),
    title: text("title"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationS: integer("duration_s"),
    participants: jsonb("participants").notNull().default([]),
    summary: text("summary"),
    recordingUrl: text("recording_url"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("meetings_started_at").on(table.startedAt.desc())]
);

// The embedded retrieval units. One chunk = one ~20-40s utterance window.
// context: LLM-generated one-line prefix (contextual retrieval).
// type:    decision | action_item | question | discussion | smalltalk (intent filter).
// embedding dim 1536 = OpenAI text-embedding-3-small. Change here + re-embed on model swap.
// tsv is generated from text so the full-text leg of hybrid search never goes stale.
export const chunks = pgTable(
  "chunks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    startS: doublePrecision("start_s").notNull(),
    endS: doublePrecision("end_s").notNull(),
    speaker: text("speaker"),
    text: text("text").notNull(),
    context: text("context"),
    type: text("type"),
    embedding: vector("embedding", { dimensions: 1536 }),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce("text", ''))`
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("chunks_meeting_id_seq_uq").on(table.meetingId, table.seq),
    // Vector leg of hybrid search. HNSW: build-once, no retraining as the corpus grows.
    index("chunks_embedding_hnsw").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
    // Keyword leg of hybrid search.
    index("chunks_tsv_gin").using("gin", table.tsv),
    index("chunks_meeting_id").on(table.meetingId),
    index("chunks_type").on(table.type),
  ]
);

// Topic chapters for the dashboard table-of-contents.
export const chapters = pgTable(
  "chapters",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    startS: doublePrecision("start_s").notNull(),
    endS: doublePrecision("end_s").notNull(),
    title: text("title").notNull(),
    gist: text("gist"),
  },
  (table) => [
    uniqueIndex("chapters_meeting_id_seq_uq").on(table.meetingId, table.seq),
  ]
);
