DROP INDEX IF EXISTS "idx_snapshot_proposals_feed";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_snapshot_proposals_space_feed";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_snapshot_proposals_executed_feed";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_snapshot_spaces_verified_activity";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_snapshot_spaces_activity";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_snapshot_spaces_followers";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_snapshot_sync_runs_latest";--> statement-breakpoint
CREATE INDEX "idx_snapshot_proposals_feed" ON "snapshot_proposals" USING btree ("created_at" DESC NULLS FIRST) WHERE "snapshot_proposals"."flagged" = false;--> statement-breakpoint
CREATE INDEX "idx_snapshot_proposals_space_feed" ON "snapshot_proposals" USING btree ("space_id","created_at" DESC NULLS FIRST) WHERE "snapshot_proposals"."flagged" = false;--> statement-breakpoint
CREATE INDEX "idx_snapshot_proposals_executed_feed" ON "snapshot_proposals" USING btree ("created_at" DESC NULLS FIRST) WHERE "snapshot_proposals"."flagged" = false AND "snapshot_proposals"."state" NOT IN ('active', 'pending', 'closed');--> statement-breakpoint
CREATE INDEX "idx_snapshot_spaces_verified_activity" ON "snapshot_spaces" USING btree ("proposal_count" DESC NULLS FIRST,"member_count" DESC NULLS FIRST,"name") WHERE "snapshot_spaces"."flagged" = false AND "snapshot_spaces"."verified" = true;--> statement-breakpoint
CREATE INDEX "idx_snapshot_spaces_activity" ON "snapshot_spaces" USING btree ("proposal_count" DESC NULLS FIRST,"member_count" DESC NULLS FIRST,"name") WHERE "snapshot_spaces"."flagged" = false;--> statement-breakpoint
CREATE INDEX "idx_snapshot_spaces_followers" ON "snapshot_spaces" USING btree ("member_count" DESC NULLS FIRST,"name") WHERE "snapshot_spaces"."flagged" = false;--> statement-breakpoint
CREATE INDEX "idx_snapshot_sync_runs_latest" ON "snapshot_sync_runs" USING btree ("entity_type","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshot_proposals_created_ts" ON "snapshot_proposals" USING btree ("created_ts" DESC NULLS LAST);
