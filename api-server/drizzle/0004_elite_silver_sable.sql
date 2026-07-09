CREATE TABLE "agent_actions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"reasoning" text,
	"evidence_quote" text,
	"evidence_start_s" double precision,
	"evidence_end_s" double precision,
	"action_hash" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_actions_hash_uq" ON "agent_actions" USING btree ("action_hash");--> statement-breakpoint
CREATE INDEX "agent_actions_meeting_id" ON "agent_actions" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "agent_actions_status" ON "agent_actions" USING btree ("status");