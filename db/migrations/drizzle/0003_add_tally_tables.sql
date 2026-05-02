CREATE TABLE "tally_organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"color" text,
	"chain_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"governor_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"has_active_proposals" boolean DEFAULT false NOT NULL,
	"proposals_count" integer DEFAULT 0 NOT NULL,
	"delegates_count" integer DEFAULT 0 NOT NULL,
	"delegates_votes_count" numeric,
	"token_owners_count" integer DEFAULT 0 NOT NULL,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tally_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"onchain_id" text,
	"organization_id" text NOT NULL,
	"organization_slug" text,
	"organization_name" text,
	"governor_id" text,
	"governor_slug" text,
	"governor_name" text,
	"chain_id" text,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"proposer_address" text,
	"creator_address" text,
	"quorum" numeric,
	"start_ts" bigint,
	"end_ts" bigint,
	"created_ts" bigint,
	"start_at" timestamp with time zone GENERATED ALWAYS AS (case when start_ts is null then null else to_timestamp(start_ts) end) STORED,
	"end_at" timestamp with time zone GENERATED ALWAYS AS (case when end_ts is null then null else to_timestamp(end_ts) end) STORED,
	"source_created_at" timestamp with time zone GENERATED ALWAYS AS (case when created_ts is null then null else to_timestamp(created_ts) end) STORED,
	"vote_stats" jsonb,
	"metadata" jsonb,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tally_organizations_slug" ON "tally_organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_tally_organizations_has_active_proposals" ON "tally_organizations" USING btree ("has_active_proposals");--> statement-breakpoint
CREATE INDEX "idx_tally_organizations_proposals_count" ON "tally_organizations" USING btree ("proposals_count");--> statement-breakpoint
CREATE INDEX "idx_tally_organizations_synced_at" ON "tally_organizations" USING btree ("synced_at");--> statement-breakpoint
CREATE INDEX "idx_tally_proposals_organization_id" ON "tally_proposals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_tally_proposals_organization_slug" ON "tally_proposals" USING btree ("organization_slug");--> statement-breakpoint
CREATE INDEX "idx_tally_proposals_governor_id" ON "tally_proposals" USING btree ("governor_id");--> statement-breakpoint
CREATE INDEX "idx_tally_proposals_chain_id" ON "tally_proposals" USING btree ("chain_id");--> statement-breakpoint
CREATE INDEX "idx_tally_proposals_status" ON "tally_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tally_proposals_source_created_at" ON "tally_proposals" USING btree ("source_created_at");--> statement-breakpoint
CREATE INDEX "idx_tally_proposals_end_at" ON "tally_proposals" USING btree ("end_at");--> statement-breakpoint
CREATE INDEX "idx_tally_proposals_synced_at" ON "tally_proposals" USING btree ("synced_at");
