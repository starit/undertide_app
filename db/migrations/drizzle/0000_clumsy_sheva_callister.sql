CREATE TABLE "proposal_enrichments" (
	"proposal_id" text PRIMARY KEY NOT NULL,
	"readable_content" text,
	"ai_summary" text,
	"importance_label" text,
	"risk_labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshot_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"choices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_ts" bigint NOT NULL,
	"end_ts" bigint NOT NULL,
	"created_ts" bigint NOT NULL,
	"start_at" timestamp with time zone GENERATED ALWAYS AS (to_timestamp(start_ts)) STORED,
	"end_at" timestamp with time zone GENERATED ALWAYS AS (to_timestamp(end_ts)) STORED,
	"created_at" timestamp with time zone GENERATED ALWAYS AS (to_timestamp(created_ts)) STORED,
	"snapshot_block" text,
	"state" text NOT NULL,
	"author" text NOT NULL,
	"network" text,
	"scores" jsonb,
	"scores_by_strategy" jsonb,
	"scores_total" numeric,
	"scores_updated_ts" bigint,
	"scores_updated_at" timestamp with time zone GENERATED ALWAYS AS (case when scores_updated_ts is null then null else to_timestamp(scores_updated_ts) end) STORED,
	"strategies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plugins" jsonb,
	"raw" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshot_space_members" (
	"space_id" text NOT NULL,
	"member_address" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshot_space_members_space_id_member_address_pk" PRIMARY KEY("space_id","member_address")
);
--> statement-breakpoint
CREATE TABLE "snapshot_spaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"about" text,
	"network" text,
	"symbol" text,
	"admins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"strategies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"filters" jsonb,
	"plugins" jsonb,
	"raw" jsonb NOT NULL,
	"snapshot_created_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshot_sync_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"rows_upserted" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "snapshot_sync_state" (
	"entity_type" text PRIMARY KEY NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_cursor" text,
	"last_created_ts" bigint,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposal_enrichments" ADD CONSTRAINT "proposal_enrichments_proposal_id_snapshot_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."snapshot_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_proposals" ADD CONSTRAINT "snapshot_proposals_space_id_snapshot_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."snapshot_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_space_members" ADD CONSTRAINT "snapshot_space_members_space_id_snapshot_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."snapshot_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_snapshot_proposals_space_id" ON "snapshot_proposals" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "idx_snapshot_proposals_state" ON "snapshot_proposals" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_snapshot_proposals_created_at" ON "snapshot_proposals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_snapshot_proposals_end_at" ON "snapshot_proposals" USING btree ("end_at");--> statement-breakpoint
CREATE INDEX "idx_snapshot_proposals_author" ON "snapshot_proposals" USING btree ("author");--> statement-breakpoint
CREATE INDEX "idx_snapshot_space_members_member_address" ON "snapshot_space_members" USING btree ("member_address");--> statement-breakpoint
CREATE INDEX "idx_snapshot_space_members_space_id" ON "snapshot_space_members" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "idx_snapshot_spaces_network" ON "snapshot_spaces" USING btree ("network");--> statement-breakpoint
CREATE INDEX "idx_snapshot_spaces_last_seen_at" ON "snapshot_spaces" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "idx_snapshot_sync_runs_entity_type" ON "snapshot_sync_runs" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_snapshot_sync_runs_started_at" ON "snapshot_sync_runs" USING btree ("started_at");