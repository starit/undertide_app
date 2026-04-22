ALTER TABLE "snapshot_space_members" DROP CONSTRAINT IF EXISTS "snapshot_space_members_space_id_snapshot_spaces_id_fk";
ALTER TABLE "snapshot_proposals" DROP CONSTRAINT IF EXISTS "snapshot_proposals_space_id_snapshot_spaces_id_fk";
ALTER TABLE "proposal_translations" DROP CONSTRAINT IF EXISTS "proposal_translations_proposal_id_snapshot_proposals_id_fk";
