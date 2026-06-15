CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"seq" integer NOT NULL,
	"start_s" double precision NOT NULL,
	"end_s" double precision NOT NULL,
	"title" text NOT NULL,
	"gist" text
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"seq" integer NOT NULL,
	"start_s" double precision NOT NULL,
	"end_s" double precision NOT NULL,
	"speaker" text,
	"text" text NOT NULL,
	"context" text,
	"type" text,
	"embedding" vector(1536),
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce("text", ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_s" integer,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"recording_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chapters_meeting_id_seq_uq" ON "chapters" USING btree ("meeting_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "chunks_meeting_id_seq_uq" ON "chunks" USING btree ("meeting_id","seq");--> statement-breakpoint
CREATE INDEX "chunks_embedding_hnsw" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chunks_tsv_gin" ON "chunks" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "chunks_meeting_id" ON "chunks" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "chunks_type" ON "chunks" USING btree ("type");--> statement-breakpoint
CREATE INDEX "meetings_started_at" ON "meetings" USING btree ("started_at" DESC NULLS LAST);