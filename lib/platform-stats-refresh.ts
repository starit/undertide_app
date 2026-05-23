import { neon } from "@neondatabase/serverless";
import { PlatformStats } from "./types";

export const PLATFORM_STATS_ROW_ID = "global";

type PlatformStatsRow = Omit<PlatformStats, "lastSuccessfulSpaceSyncAt" | "lastSuccessfulProposalSyncAt"> & {
  lastSuccessfulSpaceSyncAt: string | Date | null;
  lastSuccessfulProposalSyncAt: string | Date | null;
};

export async function refreshPlatformStats(
  databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
): Promise<PlatformStats> {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
  }

  const sql = neon(databaseUrl);
  const [stats] = (await sql`
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
      ${PLATFORM_STATS_ROW_ID},
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
    FROM spaces_summary, proposals_summary, translations_summary, translation_locale_summary, sync_summary
    ON CONFLICT (id) DO UPDATE SET
      spaces_count = excluded.spaces_count,
      verified_spaces_count = excluded.verified_spaces_count,
      proposals_count = excluded.proposals_count,
      active_proposals_count = excluded.active_proposals_count,
      translated_proposals_count = excluded.translated_proposals_count,
      translations_count = excluded.translations_count,
      translation_locale_counts = excluded.translation_locale_counts,
      last_successful_space_sync_at = excluded.last_successful_space_sync_at,
      last_successful_proposal_sync_at = excluded.last_successful_proposal_sync_at,
      refreshed_at = excluded.refreshed_at,
      updated_at = excluded.updated_at
    RETURNING
      spaces_count AS "spacesCount",
      verified_spaces_count AS "verifiedSpacesCount",
      proposals_count AS "proposalsCount",
      active_proposals_count AS "activeProposalsCount",
      translated_proposals_count AS "translatedProposalsCount",
      translations_count AS "translationsCount",
      translation_locale_counts AS "translationLocaleCounts",
      last_successful_space_sync_at AS "lastSuccessfulSpaceSyncAt",
      last_successful_proposal_sync_at AS "lastSuccessfulProposalSyncAt"
  `) as PlatformStatsRow[];

  return {
    spacesCount: stats?.spacesCount ?? 0,
    verifiedSpacesCount: stats?.verifiedSpacesCount ?? 0,
    proposalsCount: stats?.proposalsCount ?? 0,
    activeProposalsCount: stats?.activeProposalsCount ?? 0,
    translatedProposalsCount: stats?.translatedProposalsCount ?? 0,
    translationsCount: stats?.translationsCount ?? 0,
    translationLocaleCounts: stats?.translationLocaleCounts ?? {},
    lastSuccessfulSpaceSyncAt: normalizeDate(stats?.lastSuccessfulSpaceSyncAt),
    lastSuccessfulProposalSyncAt: normalizeDate(stats?.lastSuccessfulProposalSyncAt),
  };
}

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
