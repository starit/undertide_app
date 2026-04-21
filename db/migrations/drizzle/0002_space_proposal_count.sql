ALTER TABLE "snapshot_spaces" ADD COLUMN "proposal_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "snapshot_spaces" AS "spaces"
SET "proposal_count" = "counts"."proposal_count"
FROM (
  SELECT "space_id", COUNT(*)::integer AS "proposal_count"
  FROM "snapshot_proposals"
  GROUP BY "space_id"
) AS "counts"
WHERE "spaces"."id" = "counts"."space_id";
