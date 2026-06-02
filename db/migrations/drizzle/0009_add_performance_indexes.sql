CREATE INDEX "idx_snapshot_sync_runs_latest" ON "snapshot_sync_runs" USING btree ("entity_type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_snapshot_proposals_created_ts" ON "snapshot_proposals" USING btree ("created_ts" DESC NULLS LAST);
