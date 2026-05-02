# Database Workflow

This project uses **Drizzle + Neon** for schema and migration management.

## Source of truth

- Type-safe schema: `db/drizzle-schema.ts`
- Generated Drizzle migrations: `db/migrations/drizzle`
- Human-readable reference schema: `db/schema.sql`
- Initial handcrafted migration kept for reference: `db/migrations/0001_snapshot_ingest.sql`

## Commands

- Generate a new migration after schema changes:

  `pnpm db:generate`

- Apply generated migrations to the configured database:

  `npx tsx scripts/db-migrate.ts`

- Push the current schema directly to the database without creating a migration:

  `pnpm db:push`

- Check whether the Drizzle schema and migration state are in sync:

  `pnpm db:check`

- Open Drizzle Studio:

  `pnpm db:studio`

## Recommended flow

1. Edit `db/drizzle-schema.ts`
2. Run `pnpm db:generate`
3. Review the SQL in `db/migrations/drizzle`
4. Run `npx tsx scripts/db-migrate.ts`

Use `db:push` only for rapid local iteration, not as the main production migration path.

## Recent Changes

- Switched project package management to `pnpm` and standardized database commands around `pnpm`.
- Added Drizzle configuration in `drizzle.config.ts` and adopted `db/drizzle-schema.ts` as the typed schema source.
- Generated the first Drizzle-managed migration under `db/migrations/drizzle`.
- Kept the handcrafted initial SQL migration `db/migrations/0001_snapshot_ingest.sql` as a readable baseline reference.
- Added source ingest tables for Snapshot and Tally:
  - `snapshot_spaces`
  - `snapshot_space_members`
  - `snapshot_proposals`
  - `tally_organizations`
  - `tally_proposals`
  - `snapshot_sync_state`
  - `snapshot_sync_runs`
- Added a Snapshot sync script at `scripts/sync-snapshot.mjs`.
- The Snapshot sync script now lives at `scripts/sync-snapshot.ts` and reuses `db/drizzle-schema.ts`.
- The sync script now uses Drizzle queries for database reads and writes instead of raw handwritten SQL statements.
- Current sync behavior:
  - `spaces` are synced by paginated fetch with resumable progress stored in `snapshot_sync_state.last_cursor`.
  - `proposals` support incremental sync using `snapshot_sync_state.last_created_ts`.
  - Snapshot API requests use automatic retry with exponential backoff for transient failures.
- Snapshot sync entrypoints:
  - `pnpm sync:snapshot`
  - `pnpm sync:snapshot:full`
  - `npx tsx scripts/sync-snapshot.ts --spaces-only`
  - `npx tsx scripts/sync-snapshot.ts --proposals-only`
  - `npx tsx scripts/sync-snapshot.ts --spaces-only --spaces-skip 39200`
  - `pnpm backfill:space-proposal-count`
- Tally sync entrypoints:
  - `pnpm sync:tally`
  - `pnpm sync:tally:full`
  - `npx tsx scripts/sync-tally.ts --organizations-only`
  - `npx tsx scripts/sync-tally.ts --proposals-only`
  - `npx tsx scripts/sync-tally.ts --organization-slug uniswap --limit-proposals 100`
- Planned aggregate API design:
  - `docs/1. governance-aggregation-api.md`
- Proposal translation table:
  - `proposal_translations`
  - stores one row per `proposal_id + locale`
  - currently intended locales: `zh`, `ja`, `ko`
- Proposal translation entrypoint:
  - `pnpm translate:proposals`
- Database-backed API endpoints:
  - `GET /api/sources`
  - `GET /api/sync`
  - `GET /api/snapshot/spaces`
  - `GET /api/snapshot/spaces/:slug`
  - `GET /api/snapshot/spaces/:slug/proposals`
  - `GET /api/snapshot/proposals`
  - `GET /api/snapshot/proposals/:id`
    - supports `?locale=zh|ja|ko` to overlay translated title/body/summary when available
  - `GET /api/snapshot/proposals/:id/translations`
    - supports `?locale=zh|ja|ko` for a single translation
  - `GET /api/tally/organizations`
  - `GET /api/tally/organizations/:idOrSlug`
  - `GET /api/tally/organizations/:idOrSlug/proposals`
  - `GET /api/tally/proposals`
  - `GET /api/tally/proposals/:id`
  - legacy Snapshot-compatible aliases:
    - `GET /api/proposals`
    - `GET /api/proposals/:id`
    - `GET /api/proposals/:id/translations`
    - `GET /api/spaces`
    - `GET /api/spaces/:slug`
    - `GET /api/spaces/:slug/proposals`
  - `GET /api/sync/snapshot`
    - supports `?entityType=spaces` or `?entityType=proposals`
  - `GET /api/sync/tally`
    - supports `?entityType=organizations`, `?entityType=proposals`, `?entityType=tally:organizations`, or `?entityType=tally:proposals`
  - `GET /api/snapshot/sync`
  - `GET /api/tally/sync`
