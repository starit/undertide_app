# AGENTS.md

Developer reference for AI agents and contributors working in this repository.

---

## Project Overview

**undertide-app-v2** is a Next.js 15 application that syncs governance data from [Snapshot](https://snapshot.org) into a Neon (PostgreSQL) database and exposes it via a REST API. The frontend surfaces DAO spaces and proposals with enrichment, translation, and filtering.

**Stack:** Next.js 15 · React 19 · TypeScript · Drizzle ORM · Neon (serverless Postgres) · Tailwind CSS · Radix UI

---

## Repository Layout

```
.
├── app/                        # Next.js App Router
│   ├── api/                    # API route handlers
│   ├── spaces/                 # Space list and detail pages
│   ├── proposals/              # Proposal list and detail pages
│   └── page.tsx                # Home page
├── components/                 # React components
├── db/
│   ├── drizzle-schema.ts       # Single source of truth for DB schema
│   └── migrations/drizzle/     # Drizzle migration files + meta snapshots
├── docs/
│   └── 0. references-snapshot-schema.md  # Snapshot GraphQL schema reference
├── examples/                   # Benchmark scripts
├── lib/
│   ├── db.ts                   # Drizzle client setup
│   ├── i18n.ts                 # Shared UI message dictionary and locale helpers
│   ├── i18n-server.ts          # Server-only locale resolution from cookie
│   ├── repository.ts           # All DB queries and data mapping
│   └── types.ts                # Shared TypeScript interfaces
├── i18n/
│   └── request.ts              # next-intl request config
├── scripts/                    # Standalone operational scripts
├── drizzle.config.ts           # Drizzle-kit configuration
└── AGENTS.md                   # This file
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes (one of two) | Neon pooled connection string (pgBouncer) — used by the Next.js app |
| `DATABASE_URL_UNPOOLED` | Yes (one of two) | Neon direct connection string — used by Drizzle-kit and migration scripts |
| `DEEPSEEK_API_KEY` | For translation only | DeepSeek API key |
| `DEEPSEEK_BASE_URL` | No | DeepSeek base URL (default: `https://api.deepseek.com`) |
| `DEEPSEEK_MODEL` | No | DeepSeek model ID (default: `deepseek-chat`) |

`DATABASE_URL_UNPOOLED` is preferred over `DATABASE_URL` for all scripts and migrations because pooled pgBouncer connections cause DDL hangs with drizzle-kit.

Copy `.env.example` to `.env` to get started.

---

## npm Scripts

| Script | Command |
|---|---|
| `dev` | `next dev` |
| `build` | `next build` |
| `start` | `next start` |
| `lint` | `next lint` |
| `db:generate` | `drizzle-kit generate --config drizzle.config.ts` |
| `db:migrate` | `drizzle-kit migrate --config drizzle.config.ts` |
| `db:push` | `drizzle-kit push --config drizzle.config.ts` |
| `db:studio` | `drizzle-kit studio --config drizzle.config.ts` |
| `db:check` | `drizzle-kit check --config drizzle.config.ts` |
| `sync:snapshot` | `npx tsx scripts/sync-snapshot.ts` |
| `sync:snapshot:full` | `npx tsx scripts/sync-snapshot.ts --full` |
| `backfill:space-proposal-count` | `npx tsx scripts/backfill-space-proposal-count.ts` |
| `backfill:space-avatar` | `npx tsx scripts/backfill-space-avatar.ts` |
| `translate:proposals` | `npx tsx scripts/translate-proposals.ts` |

> **Do not use `pnpm db:migrate`** (drizzle-kit's migrate command) for routine migrations — it uses WebSocket mode and can hang against Neon. Use `npx tsx scripts/db-migrate.ts` instead (see below).

---

## Database Schema

**Source of truth: [`db/drizzle-schema.ts`](db/drizzle-schema.ts)** — read that file directly for column names, types, and constraints. Do not duplicate it here.

6 tables: `snapshot_spaces`, `snapshot_space_members`, `snapshot_proposals`, `proposal_translations`, `snapshot_sync_state`, `snapshot_sync_runs`.

Notable conventions:
- All tables have `created_at` and `updated_at` (`timestamptz NOT NULL DEFAULT now()`), set on insert and upsert respectively
- `snapshot_proposals.created_at`, `updated_at`, `start_at`, `end_at`, `scores_updated_at` are **generated columns** derived from Unix-second bigint fields — do not write to them directly
- `snapshot_proposals.synced_at` is the DB-managed sync timestamp (distinct from the Snapshot-derived `updated_at`)
- `avatar` on spaces may be an `ipfs://` URL — resolve with `resolveIpfsUrl()` in `lib/repository.ts`
- `raw` (jsonb, NOT NULL) on both `snapshot_spaces` and `snapshot_proposals` stores the full Snapshot API response

---

## Migrations

Migrations live in `db/migrations/drizzle/`. The tracking table is `drizzle.__drizzle_migrations`.

### Recommended workflow for schema changes

1. Edit `db/drizzle-schema.ts`
2. Run `pnpm db:generate` — drizzle-kit diffs the schema against its latest snapshot and produces a new `.sql` file
3. Apply with `npx tsx scripts/db-migrate.ts` (not `pnpm db:migrate`)
4. Commit the new `.sql` file and the updated `meta/` files together

### When to write a migration manually

Use `ALTER TABLE ... RENAME COLUMN` (not DROP + ADD) for column renames — drizzle-kit generates DROP/ADD which loses data. After writing the SQL manually:

1. Add the entry to `db/migrations/drizzle/meta/_journal.json`
2. Apply with `npx tsx scripts/db-migrate.ts`
3. Run `pnpm db:generate` to resync drizzle-kit's internal snapshot, then delete the generated file (it will be empty or a no-op diff)

### Consolidating migrations

When the migration history becomes unwieldy, consolidate:

1. Delete all `.sql` files and snapshot `.json` files under `db/migrations/drizzle/meta/`
2. Reset the journal: `{"version":"7","dialect":"postgresql","entries":[]}`
3. Run `pnpm db:generate` — produces a fresh `0000_*.sql` from the current schema
4. Compute the SHA-256 of the new file: `shasum -a 256 db/migrations/drizzle/0000_*.sql`
5. Clear and re-seed the tracking table:
   ```sql
   DELETE FROM drizzle.__drizzle_migrations;
   INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<hash>', <epoch_ms>);
   ```

---

## Scripts

### `scripts/db-migrate.ts`

Applies pending Drizzle migrations using the Neon HTTP driver (avoids WebSocket hangs).

```bash
npx tsx scripts/db-migrate.ts
```

No CLI flags. Uses `DATABASE_URL_UNPOOLED` or `DATABASE_URL`.

---

### `scripts/sync-snapshot.ts`

Syncs spaces and proposals from the Snapshot GraphQL API (`https://hub.snapshot.org/graphql`) into the database.

```bash
# Incremental sync (resumes from last cursor / lastCreatedTs)
pnpm sync:snapshot

# Full resync from scratch
pnpm sync:snapshot:full

# Sync only one entity type
npx tsx scripts/sync-snapshot.ts --spaces-only
npx tsx scripts/sync-snapshot.ts --proposals-only

# Resume spaces from a specific offset
npx tsx scripts/sync-snapshot.ts --spaces-skip 5000
```

**Flags:**

| Flag | Description |
|---|---|
| `--full` | Ignore previous sync state; start from the beginning |
| `--spaces-only` | Skip proposals sync |
| `--proposals-only` | Skip spaces sync |
| `--spaces-skip <n>` | Start spaces sync at offset n |

**Retry behaviour:** 4 retries with exponential backoff — 1500 ms base for API requests, 1000 ms base for DB operations.

**Incremental logic:**
- Spaces: cursor is a skip offset stored in `snapshot_sync_state.last_cursor`
- Proposals: ordered by `created` descending; stops when it sees a proposal with `created_ts ≤ last_created_ts`

After syncing proposals, `proposal_count` is recomputed for all touched spaces from actual row counts.

---

### `scripts/backfill-space-avatar.ts`

Fetches avatar URLs from Snapshot for all spaces where `avatar IS NULL`. Processes in batches of 100 (Snapshot API `id_in` limit).

```bash
pnpm backfill:space-avatar
```

---

### `scripts/backfill-space-proposal-count.ts`

Recomputes `proposal_count` for all spaces by counting rows in `snapshot_proposals` grouped by `space_id`. Uses a `CASE … END` bulk update in chunks of 500.

```bash
pnpm backfill:space-proposal-count
```

---

### `scripts/translate-proposals.ts`

Translates proposal content into target locales using the DeepSeek API. Writes results to `proposal_translations`.

```bash
# Translate up to 10 untranslated proposals into zh, ja, ko
pnpm translate:proposals

# Specific proposal
npx tsx scripts/translate-proposals.ts --proposal-id <id>

# Specific locale(s)
npx tsx scripts/translate-proposals.ts --locale zh --locale ja

# Override limit and force overwrite
npx tsx scripts/translate-proposals.ts --limit 50 --overwrite
```

**Flags:**

| Flag | Description |
|---|---|
| `--proposal-id <id>` | Translate a single proposal by ID |
| `--locale <locale>` | Target locale (repeatable); defaults to `zh`, `ja`, `ko` |
| `--limit <n>` | Max proposals to process (default: 10) |
| `--overwrite` | Overwrite existing translations (default: skip) |

Requires: `DEEPSEEK_API_KEY`, optionally `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`.

---

## Multilingual Workflow

UI i18n uses `next-intl` without locale-prefixed routes.

- Supported UI locales: `en`, `zh`, `ja`, `ko`
- Locale source: `ui_locale` cookie
- Server locale resolution: `lib/i18n-server.ts`
- next-intl request config: `i18n/request.ts`
- Shared UI messages: `lib/i18n.ts`

### Rules

1. Use `getServerLocale()` only in Server Components, layouts, and metadata functions
2. Do not import `next/headers` into shared or client code
3. Keep UI copy in `lib/i18n.ts`
4. Proposal body translation is separate from UI i18n and comes from `proposal_translations`
5. UI locale and proposal content locale are independent

### Updating UI copy

1. Add or update the message in `lib/i18n.ts` for all four locales
2. Use the shared message from server or client code
3. For parameterized strings, use `formatMessage(...)`
4. Keep message keys stable; do not create near-duplicate keys for the same UI concept

### Choosing the right mechanism

- UI labels, buttons, headings, helper text: `next-intl` messages
- Proposal title/body/summary translations: database-backed `proposal_translations`
- Dynamic proposal detail language switcher: query param `?locale=...`, not the UI locale cookie

---

## API Routes

All routes return JSON. Success shape: `{ data: T }`. Errors return appropriate HTTP status with `{ error: string }`.

### `GET /api/health`

Returns database connection status.

```json
{ "ok": true, "database": "configured", "mode": "neon-http" }
```

---

### `GET /api/spaces`

| Param | Type | Description |
|---|---|---|
| `q` | `string` | Search by space name (case-insensitive) |
| `category` | `string` | Filter by category (e.g. `"DeFi"`) |
| `verified` | `"true" \| "false"` | Filter by verified status |
| `sort` | `"activity" \| "followers"` | Sort order (default: `activity`) |
| `limit` | `number` | Max results (default: 200) |

Returns: `{ data: Space[] }`

---

### `GET /api/spaces/[slug]`

Returns: `{ data: Space }` or 404.

---

### `GET /api/spaces/[slug]/proposals`

| Param | Type | Description |
|---|---|---|
| `q` | `string` | Search by proposal title or space name |
| `status` | `"Active" \| "Upcoming" \| "Closed" \| "Executed" \| "All"` | Filter by status |
| `sort` | `"time" \| "heat" \| "importance"` | Sort order |
| `limit` | `number` | Max results |

Returns: `{ data: Proposal[] }`

---

### `GET /api/proposals`

Same params as `/api/spaces/[slug]/proposals`, plus:

| Param | Type | Description |
|---|---|---|
| `spaceSlug` | `string` | Filter by space ID |

Returns: `{ data: Proposal[] }`

---

### `GET /api/proposals/[id]`

| Param | Type | Description |
|---|---|---|
| `locale` | `string` | If provided, overlays translation (title, summary, readableContent) |

Returns: `{ data: ProposalDetail }` or 404.

---

### `GET /api/proposals/[id]/translations`

| Param | Type | Description |
|---|---|---|
| `locale` | `string` (repeatable) | Filter to specific locales; omit for all |

Returns: `{ data: ProposalTranslation[] }` or 404 if specific locale not found.

---

### `GET /api/sync/snapshot`

| Param | Type | Description |
|---|---|---|
| `entityType` | `string` (repeatable) | Filter to `"spaces"` or `"proposals"` |

Returns: `{ data: SnapshotSyncState[] }`

---

## TypeScript Types (`lib/types.ts`)

```typescript
type ProposalStatus = "Active" | "Upcoming" | "Closed" | "Executed";
type ProposalPriority = "High Signal" | "Treasury Risk" | "Routine" | "Strategic";

interface Proposal {
  id: string;
  title: string;
  protocol: string;          // space.name
  spaceSlug: string;         // space.id
  status: ProposalStatus;    // mapped from raw state
  publishedAt: string;       // ISO — from created_ts
  closesAt: string;          // ISO — from end_ts
  heat: number;              // computed 10–99
  votesCount: number;
  type: string | null;       // e.g. "single-choice", "basic", "weighted"
  importance: ProposalPriority;
  labels: string[];
  quorum: number | null;
  quorumType: string | null;
  app: string | null;
  discussion: string | null; // actual forum URL (from Snapshot discussion field)
  summary: string;
  aiSummary: string;
  readableContent: string;
  facts: string[];
  risks: string[];
  discussionUrl: string;     // forum URL when available, else Snapshot proposal URL
  proposalUrl: string;       // https://snapshot.box/#/<spaceId>/proposal/<id>
}

interface ProposalTranslation {
  proposalId: string;
  locale: string;
  title: string;
  body: string;
  summary: string;
  translatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProposalDetail extends Proposal {
  translation: ProposalTranslation | null;
}

interface Space {
  slug: string;              // space.id
  name: string;
  tagline: string;           // first sentence of summary, truncated to 72 chars
  verified: boolean;
  flagged: boolean;
  hibernated: boolean;
  turbo: boolean;
  followers: number;         // followersCount || memberCount
  proposals: number;         // proposalCount
  activeProposals: number;
  votes: number;             // votesCount
  categories: string[];
  activityScore: number;     // computed 8–99
  website: string;           // DB website field, fallback to Snapshot space URL
  forum: string;             // DB discussions field, fallback to Snapshot space URL
  twitter: string | null;
  github: string | null;
  coingecko: string | null;
  summary: string;           // normalized about text
  avatar: string | null;     // IPFS URLs resolved to https://ipfs.io/ipfs/…
}

interface SnapshotSyncState {
  entityType: string;
  lastSuccessAt: string | null;
  lastCursor: string | null;
  lastCreatedTs: number | null;
  lastError: string | null;
  updatedAt: string;
  latestRun: {
    id: number;
    createdAt: string;
    finishedAt: string | null;
    updatedAt: string | null;
    status: string;
    rowsUpserted: number;
    error: string | null;
  } | null;
}
```

---

## Repository Layer (`lib/repository.ts`)

All DB access goes through this file. It handles SQL filtering, joining, and mapping raw DB rows to the types above.

| Function | Returns |
|---|---|
| `listSpaces(query?)` | `Promise<Space[]>` |
| `getSpaceBySlug(slug)` | `Promise<Space \| null>` |
| `listProposals(query?)` | `Promise<Proposal[]>` |
| `listSpaceProposals(spaceSlug, query?)` | `Promise<Proposal[]>` |
| `getProposalById(id)` | `Promise<Proposal \| null>` |
| `getProposalDetail(id, locale?)` | `Promise<ProposalDetail \| null>` |
| `getProposalTranslations(proposalId, locales?)` | `Promise<ProposalTranslation[]>` |
| `getProposalTranslation(proposalId, locale)` | `Promise<ProposalTranslation \| null>` |
| `listSnapshotSyncStates(entityTypes?)` | `Promise<SnapshotSyncState[]>` |

**SQL pushdown:** `spaceSlug`, `status`, `q` (ilike on title/space name), `verified`, and time-ordered `LIMIT` are all pushed to SQL `WHERE`/`ORDER BY`. Heat, importance sort, and category filter are applied in-memory on a capped result set.

**Computed fields:**
- `heat` = `max(10, min(99, round(log10(scoresTotal + 10) * 24 + log10(memberCount + 10) * 12)))`
- `activityScore` = `max(8, min(99, round(log10(followersCount + 10) * 20 + log10(proposalCount + 1) * 18)))`
- `status` mapping: `active` → `Active`, `pending` → `Upcoming`, `closed` → `Closed`, anything else → `Executed`

---

## Path Alias

`@/*` resolves to the repo root. Use it in all imports:

```typescript
import { snapshotSpaces } from "@/db/drizzle-schema";
import { listProposals } from "@/lib/repository";
```

---

## Drizzle Config (`drizzle.config.ts`)

```typescript
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/drizzle-schema.ts",
  out: "./db/migrations/drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL },
  verbose: true,
  strict: true,
});
```

Prefers `DATABASE_URL_UNPOOLED` for direct (non-pooled) connections required by DDL operations.
