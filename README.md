# UnderTide App v2

UnderTide is a Next.js app for Web3 governance intelligence. It syncs governance data from Snapshot into Postgres, exposes API endpoints, and provides a multilingual UI focused on AI/Agent-friendly context.

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Run dev server:

```bash
pnpm dev
```

App will be available at `http://localhost:3000`.

## Required Environment Variables

- `DATABASE_URL` or `DATABASE_URL_UNPOOLED`
- `DEEPSEEK_API_KEY` (only needed for translation scripts)

## Common Commands

- `pnpm dev` - start local dev server
- `pnpm lint` - run lint checks
- `pnpm build` - production build
- `pnpm sync:snapshot` - incremental sync from Snapshot
- `pnpm sync:snapshot:full` - full sync from scratch

## Project Structure

- `app/` - App Router pages and API routes
- `components/` - UI and feature components
- `lib/` - repository layer, i18n, shared utilities and types
- `db/` - Drizzle schema and migrations
- `scripts/` - sync/backfill/translation scripts

## Notes

- Prefer `DATABASE_URL_UNPOOLED` for migration/script operations.
- UI locale and proposal translation locale are independent.
