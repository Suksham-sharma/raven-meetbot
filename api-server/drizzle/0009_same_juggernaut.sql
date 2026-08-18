CREATE TABLE "calendar_accounts" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"refresh_token" text,
	"mode" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_schedules" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"occurrence_start" timestamp with time zone NOT NULL,
	"occurrence_end" timestamp with time zone,
	"title" text,
	"meet_url" text NOT NULL,
	"job_id" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_accounts" ADD CONSTRAINT "calendar_accounts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_oauth_states" ADD CONSTRAINT "calendar_oauth_states_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_schedules" ADD CONSTRAINT "calendar_schedules_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_oauth_states_owner_id" ON "calendar_oauth_states" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_schedules_occurrence_uq" ON "calendar_schedules" USING btree ("owner_id","event_id","occurrence_start");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_schedules_job_id_uq" ON "calendar_schedules" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "calendar_schedules_owner_start" ON "calendar_schedules" USING btree ("owner_id","occurrence_start");
