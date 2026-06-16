CREATE TABLE "action_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"seq" integer NOT NULL,
	"text" text NOT NULL,
	"owner" text,
	"due" text,
	"evidence_quote" text NOT NULL,
	"speaker" text,
	"start_s" double precision NOT NULL,
	"end_s" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"seq" integer NOT NULL,
	"text" text NOT NULL,
	"evidence_quote" text NOT NULL,
	"speaker" text,
	"start_s" double precision NOT NULL,
	"end_s" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "action_items_meeting_id_seq_uq" ON "action_items" USING btree ("meeting_id","seq");--> statement-breakpoint
CREATE INDEX "action_items_meeting_id" ON "action_items" USING btree ("meeting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "decisions_meeting_id_seq_uq" ON "decisions" USING btree ("meeting_id","seq");--> statement-breakpoint
CREATE INDEX "decisions_meeting_id" ON "decisions" USING btree ("meeting_id");