ALTER TABLE "action_items" ALTER COLUMN "evidence_quote" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "action_items" ALTER COLUMN "start_s" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "action_items" ALTER COLUMN "end_s" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "action_items" ADD COLUMN "source" text DEFAULT 'extracted' NOT NULL;