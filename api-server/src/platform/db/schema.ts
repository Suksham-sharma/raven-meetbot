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
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// pgvector ships no Drizzle-native tsvector type; declare a minimal one.
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_uq").on(table.email)]
);

export const calendarAccounts = pgTable("calendar_accounts", {
  ownerId: uuid("owner_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  refreshToken: text("refresh_token"),
  mode: text("mode").notNull().default("manual"),
  status: text("status").notNull().default("connected"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastError: text("last_error"),
  connectedAt: timestamp("connected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const calendarOauthStates = pgTable(
  "calendar_oauth_states",
  {
    stateHash: text("state_hash").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("calendar_oauth_states_owner_id").on(table.ownerId)]
);

export const calendarSchedules = pgTable(
  "calendar_schedules",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    occurrenceStart: timestamp("occurrence_start", { withTimezone: true }).notNull(),
    occurrenceEnd: timestamp("occurrence_end", { withTimezone: true }),
    title: text("title"),
    meetUrl: text("meet_url").notNull(),
    jobId: text("job_id").notNull(),
    status: text("status").notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("calendar_schedules_occurrence_uq").on(
      table.ownerId,
      table.eventId,
      table.occurrenceStart
    ),
    uniqueIndex("calendar_schedules_job_id_uq").on(table.jobId),
    index("calendar_schedules_owner_start").on(table.ownerId, table.occurrenceStart),
  ]
);

export const meetings = pgTable(
  "meetings",
  {
    id: text("id").primaryKey(),
    // Children inherit ownership via meeting_id, so this column is the whole
    // tenancy boundary. Nullable only for pre-auth rows, which read as invisible.
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    type: text("type"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationS: integer("duration_s"),
    participants: jsonb("participants").notNull().default([]),
    summary: text("summary"),
    recordingUrl: text("recording_url"),
    // Written by the transcode worker. The raw webm is not seekable, so mp4Key
    // is what the player loads; null means transcode has not finished.
    mp4Key: text("mp4_key"),
    posterKey: text("poster_key"),
    // Recording t=0 minus transcript t=0. Citations land at start_s + this, so a
    // Deepgram/recording clock skew is corrected per-meeting rather than silently
    // pointing every clip at the wrong moment. Verified and set at ingest.
    recordingOffsetS: doublePrecision("recording_offset_s").notNull().default(0),
    status: text("status").notNull().default("pending"),
    statusError: text("status_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("meetings_started_at").on(table.startedAt.desc()),
    index("meetings_owner_id").on(table.ownerId),
  ]
);

// embedding dim 1536 = OpenAI text-embedding-3-small; changing it requires a re-embed.
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
    index("chunks_embedding_hnsw").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
    index("chunks_tsv_gin").using("gin", table.tsv),
    index("chunks_meeting_id").on(table.meetingId),
    index("chunks_type").on(table.type),
  ]
);

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

// evidence_quote is verified by the quote-guard at ingest, so a hallucinated
// decision (quote absent from the transcript) never lands.
export const decisions = pgTable(
  "decisions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    text: text("text").notNull(),
    evidenceQuote: text("evidence_quote").notNull(),
    speaker: text("speaker"),
    startS: doublePrecision("start_s").notNull(),
    endS: doublePrecision("end_s").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("decisions_meeting_id_seq_uq").on(table.meetingId, table.seq),
    index("decisions_meeting_id").on(table.meetingId),
  ]
);

export const agentActions = pgTable(
  "agent_actions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    payload: jsonb("payload").notNull(),
    reasoning: text("reasoning"),
    evidenceQuote: text("evidence_quote"),
    evidenceStartS: doublePrecision("evidence_start_s"),
    evidenceEndS: doublePrecision("evidence_end_s"),
    actionHash: text("action_hash").notNull(),
    status: text("status").notNull().default("proposed"),
    result: jsonb("result"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("agent_actions_hash_uq").on(table.actionHash),
    index("agent_actions_meeting_id").on(table.meetingId),
    index("agent_actions_status").on(table.status),
  ]
);

export const actionItems = pgTable(
  "action_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    text: text("text").notNull(),
    owner: text("owner"),
    due: text("due"),
    source: text("source").notNull().default("extracted"),
    evidenceQuote: text("evidence_quote"),
    speaker: text("speaker"),
    startS: doublePrecision("start_s"),
    endS: doublePrecision("end_s"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("action_items_meeting_id_seq_uq").on(table.meetingId, table.seq),
    index("action_items_meeting_id").on(table.meetingId),
  ]
);
