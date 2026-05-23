CREATE EXTENSION IF NOT EXISTS "pg_trgm";
--> statement-breakpoint
CREATE TABLE "platform_stats" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"spaces_count" integer DEFAULT 0 NOT NULL,
	"verified_spaces_count" integer DEFAULT 0 NOT NULL,
	"proposals_count" integer DEFAULT 0 NOT NULL,
	"active_proposals_count" integer DEFAULT 0 NOT NULL,
	"translated_proposals_count" integer DEFAULT 0 NOT NULL,
	"translations_count" integer DEFAULT 0 NOT NULL,
	"translation_locale_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_successful_space_sync_at" timestamp with time zone,
	"last_successful_proposal_sync_at" timestamp with time zone,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
WITH
  spaces_summary AS (
    SELECT
      count(*)::int AS spaces_count,
      count(*) FILTER (WHERE verified)::int AS verified_spaces_count
    FROM snapshot_spaces
  ),
  proposals_summary AS (
    SELECT
      count(*)::int AS proposals_count,
      count(*) FILTER (WHERE state = 'active')::int AS active_proposals_count
    FROM snapshot_proposals
  ),
  translations_summary AS (
    SELECT
      count(*)::int AS translations_count,
      count(DISTINCT proposal_id)::int AS translated_proposals_count
    FROM proposal_translations
  ),
  translation_locale_summary AS (
    SELECT coalesce(jsonb_object_agg(locale, locale_count), '{}'::jsonb) AS translation_locale_counts
    FROM (
      SELECT locale, count(*)::int AS locale_count
      FROM proposal_translations
      GROUP BY locale
    ) locale_counts
  ),
  sync_summary AS (
    SELECT
      max(last_success_at) FILTER (WHERE entity_type = 'spaces') AS last_successful_space_sync_at,
      max(last_success_at) FILTER (WHERE entity_type = 'proposals') AS last_successful_proposal_sync_at
    FROM snapshot_sync_state
    WHERE entity_type IN ('spaces', 'proposals')
  )
INSERT INTO platform_stats (
  id,
  spaces_count,
  verified_spaces_count,
  proposals_count,
  active_proposals_count,
  translated_proposals_count,
  translations_count,
  translation_locale_counts,
  last_successful_space_sync_at,
  last_successful_proposal_sync_at,
  refreshed_at,
  updated_at
)
SELECT
  'global',
  spaces_summary.spaces_count,
  spaces_summary.verified_spaces_count,
  proposals_summary.proposals_count,
  proposals_summary.active_proposals_count,
  translations_summary.translated_proposals_count,
  translations_summary.translations_count,
  translation_locale_summary.translation_locale_counts,
  sync_summary.last_successful_space_sync_at,
  sync_summary.last_successful_proposal_sync_at,
  now(),
  now()
FROM spaces_summary, proposals_summary, translations_summary, translation_locale_summary, sync_summary;
--> statement-breakpoint
CREATE INDEX "idx_snapshot_proposals_title_trgm" ON "snapshot_proposals" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_snapshot_spaces_verified_activity" ON "snapshot_spaces" USING btree ("proposal_count" DESC NULLS LAST,"member_count" DESC NULLS LAST,"name") WHERE "snapshot_spaces"."flagged" = false AND "snapshot_spaces"."verified" = true;--> statement-breakpoint
CREATE INDEX "idx_snapshot_spaces_name_trgm" ON "snapshot_spaces" USING gin ("name" gin_trgm_ops);
