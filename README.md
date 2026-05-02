# UnderTide App v2

UnderTide is a Next.js app for Web3 governance intelligence. It syncs governance data from Snapshot and Tally into Postgres, exposes API endpoints, and provides a multilingual UI focused on AI/Agent-friendly context.

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

1. Create env file:

```bash
cp .env.example .env
```

1. Run dev server:

```bash
pnpm dev
```

App will be available at `http://localhost:3000`.

## Required Environment Variables

- `DATABASE_URL` or `DATABASE_URL_UNPOOLED`
- `DEEPSEEK_API_KEY` (only needed for translation scripts)
- `TALLY_API_KEY` (only needed for Tally governance sync)

## Common Commands

- `pnpm dev` - start local dev server
- `pnpm lint` - run lint checks
- `pnpm build` - production build
- `pnpm sync:snapshot` - incremental sync from Snapshot
- `pnpm sync:snapshot:full` - full sync from scratch
- `pnpm sync:tally` - sync Tally governance organizations and recent proposals
- `pnpm sync:tally:full` - full Tally proposal sync for selected organizations
- `pnpm translate:proposals` - translate proposals (`zh/ja/ko`) into `proposal_translations`

## API Notes

- Source-specific APIs are available under `/api/snapshot/*` and `/api/tally/*`; see [`docs/1. governance-aggregation-api.md`](docs/1.%20governance-aggregation-api.md).
- `GET /api/sources` returns source capability metadata; `GET /api/sync` returns grouped Snapshot/Tally sync state.
- `GET /api/snapshot/proposals` supports `locale=<zh|ja|ko>` and `translatedOnly=true`.
- Legacy `/api/spaces` and `/api/proposals` remain Snapshot-compatible during migration.

## Translation Notes

- The translation pipeline preserves markdown structure for proposal body content.
- Fenced code blocks are protected with placeholders before LLM translation and restored afterward to avoid losing code-fence structure in translated output.
- **CLI flags, env tuning, two-phase vs single-shot, and troubleshooting:** [`scripts/README.md`](scripts/README.md) (Translate Proposals section).

## Project Structure

- `app/` - App Router pages and API routes
- `components/` - UI and feature components
- `lib/` - repository layer, i18n, shared utilities and types
- `db/` - Drizzle schema and migrations
- `scripts/` - sync/backfill/translation scripts

## Notes

- Prefer `DATABASE_URL_UNPOOLED` for migration/script operations.
- UI locale and proposal translation locale are independent.
