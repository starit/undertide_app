# AGENTS.md

Developer reference for AI agents and contributors working in this repository.

---

## Project Overview

**undertide-app-v2** is a Next.js 15 application that syncs governance data from [Snapshot](https://snapshot.org) and Tally into a Neon (PostgreSQL) database and exposes it via a REST API. The frontend surfaces DAO spaces and proposals with enrichment, translation, and filtering.

**Stack:** Next.js 15 · React 19 · TypeScript · Drizzle ORM · Neon (serverless Postgres) · Tailwind CSS · Radix UI

**Theming:** CSS variables in `app/globals.css`, `next-themes`, and Tailwind; **themed.js** (`@themed.js/react`) also injects `--themed-*` tokens, synced from the UI theme — see [`docs/2. themes.md`](docs/2.%20themes.md).

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
│   ├── 0. references-snapshot-schema.md  # Snapshot GraphQL schema reference
│   ├── 1. governance-aggregation-api.md  # Planned multi-source aggregate API design
│   └── 2. themes.md                      # How to add UI themes (CSS variables + next-themes)
├── examples/                   # Benchmark scripts
├── lib/
│   ├── db.ts                   # Drizzle client setup
│   ├── governance/             # Source descriptors and future aggregate API helpers
│   ├── i18n.ts                 # Shared UI message dictionary and locale helpers
│   ├── i18n-server.ts          # Server-only locale resolution from cookie
│   ├── repository.ts           # All DB queries and data mapping
│   ├── tally/                  # Tally GraphQL client
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
| `DEEPSEEK_API_KEY` | For translation + theme AI | DeepSeek API key |
| `DEEPSEEK_BASE_URL` | No | DeepSeek base URL (default: `https://api.deepseek.com`) |
| `DEEPSEEK_MODEL` | No | DeepSeek model ID (default: `deepseek-chat`) |
| `THEME_GENERATE_MIN_INTERVAL_MS` | No | Min milliseconds between `POST /api/themes/generate` calls **per client IP** (default: `5000`). In-memory per Node instance. |
| `TALLY_API_KEY` | For Tally sync only | Tally governance API key |
| `TALLY_API_URL` | No | Tally GraphQL endpoint (default: `https://api.tally.xyz/query`) |

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
| `sync:tally` | `npx tsx scripts/sync-tally.ts` |
| `sync:tally:full` | `npx tsx scripts/sync-tally.ts --full` |
| `link:protocols` | `npx tsx scripts/link-governance-protocols.ts` |
| `backfill:space-proposal-count` | `npx tsx scripts/backfill-space-proposal-count.ts` |
| `backfill:space-avatar` | `npx tsx scripts/backfill-space-avatar.ts` |
| `translate:proposals` | `npx tsx scripts/translate-proposals.ts` |
| `list:retranslate-candidates` | `npx tsx scripts/list-retranslate-candidates.ts` |

> **Do not use `pnpm db:migrate`** (drizzle-kit's migrate command) for routine migrations — it uses WebSocket mode and can hang against Neon. Use `npx tsx scripts/db-migrate.ts` instead (see below).

---

## Database Schema

**Source of truth: [`db/drizzle-schema.ts`](db/drizzle-schema.ts)** — read that file directly for column names, types, and constraints. Do not duplicate it here.

10 tables: `snapshot_spaces`, `snapshot_space_members`, `snapshot_proposals`, `proposal_translations`, `snapshot_sync_state`, `snapshot_sync_runs`, `tally_organizations`, `tally_proposals`, `governance_protocols`, `governance_protocol_sources`.

Notable conventions:
- All tables have `created_at` and `updated_at` (`timestamptz NOT NULL DEFAULT now()`), set on insert and upsert respectively
- `snapshot_proposals.created_at`, `updated_at`, `start_at`, `end_at`, `scores_updated_at` are **generated columns** derived from Unix-second bigint fields — do not write to them directly
- `snapshot_proposals.synced_at` is the DB-managed sync timestamp (distinct from the Snapshot-derived `updated_at`)
- `avatar` on spaces may be an `ipfs://` URL — resolve with `resolveIpfsUrl()` in `lib/repository.ts`
- `raw` (jsonb, NOT NULL) on both `snapshot_spaces` and `snapshot_proposals` stores the full Snapshot API response
- `raw` (jsonb, NOT NULL) on `tally_organizations` and `tally_proposals` stores the full Tally API response
- `tally_proposals.source_created_at`, `start_at`, and `end_at` are generated columns derived from Unix-second bigint fields — do not write to them directly

### Source and aggregation conventions

- Keep source-specific ingest tables separate (`snapshot_*`, `tally_*`) until aggregate query patterns justify materialized views or aggregate tables
- Public aggregate IDs must be source-scoped: `snapshot:<id>` or `tally:<id>`
- Canonical protocol mappings live in `governance_protocols` and `governance_protocol_sources`
- Source descriptors live in `lib/governance/sources.ts`
- The aggregate API contract lives in `docs/1. governance-aggregation-api.md`
- Use `/api/snapshot/*` and `/api/tally/*` for source-specific APIs
- Do not change existing `/api/spaces` or `/api/proposals` response shapes while adding source-specific or aggregate routes

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

### `scripts/sync-tally.ts`

Syncs Tally governance organizations and proposals from the Tally GraphQL API (`https://api.tally.xyz/query`) into the database.

```bash
# Sync organizations and recent proposals
pnpm sync:tally

# Full proposal sync for selected organizations
pnpm sync:tally:full --organization-slug uniswap

# Sync only one entity type
npx tsx scripts/sync-tally.ts --organizations-only
npx tsx scripts/sync-tally.ts --proposals-only
```

**Flags:**

| Flag | Description |
|---|---|
| `--full` | Do not resume organization cursor; remove the default per-organization proposal cap |
| `--organizations-only` | Skip proposal sync |
| `--proposals-only` | Skip organization sync and use existing `tally_organizations` rows |
| `--organization-id <id>` | Restrict work to one Tally organization ID (repeatable) |
| `--organization-slug <slug>` | Restrict work to one Tally organization slug (repeatable) |
| `--limit-organizations <n>` | Max organizations to fetch |
| `--limit-proposals <n>` | Max proposals per organization unless `--full` is used |
| `--proposal-organization-limit <n>` | Max stored organizations scanned for proposal sync without explicit filters |

**Sync state entity types:**
- Organizations: `tally:organizations`
- Proposals: `tally:proposals`

---

### `scripts/link-governance-protocols.ts`

Links already-synced Snapshot spaces and Tally organizations into canonical protocol rows.

```bash
# Preview proposed links
pnpm link:protocols --dry-run --limit 50

# Write protocol links
pnpm link:protocols --min-proposals 1

# Link one source family
npx tsx scripts/link-governance-protocols.ts --source snapshot --limit 1000
npx tsx scripts/link-governance-protocols.ts --source tally --limit 1000

# Use or bypass manual protocol source seeds
pnpm link:protocols --seed-file data/governance-protocol-sources.json
pnpm link:protocols --skip-seed
```

Writes:
- `governance_protocols`
- `governance_protocol_sources`

This script does not fetch external APIs. Run it after `sync:snapshot` and/or `sync:tally`. Manual seeds in `data/governance-protocol-sources.json` run before automatic linking, and automatic links do not overwrite manual source refs.

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

**Environment tuning:**

| Variable | Default | Description |
|---|---|---|
| `TRANSLATE_PROPOSALS_BATCH_SIZE` | `100` | Proposals fetched per DB batch |
| `TRANSLATE_PROPOSALS_LIMIT` | `10` | Default `--limit` value |
| `TRANSLATE_MAX_TOKENS` | `32768` | `max_tokens` for the **body-only** completion (phase 2) and for **single-shot** |
| `TRANSLATE_MAX_TOKENS_META` | `16384` | `max_tokens` for the **title + short-summary** completion (phase 1) |
| `TRANSLATE_MAX_BODY_CHARS` | `250000` | Input body truncation threshold (UTF-16 length; provider context is the real limit) |
| `TRANSLATE_TWO_PHASE_BODY_CHARS` | `4000` | Above this source body length (before code-fence protection), two DeepSeek completions are used; below, one shot with `title`+`body`+`summary` JSON |

**Markdown structure guarantees (important):**
- The script protects fenced code blocks (` ```...``` `) with placeholders before translation.
- Placeholders are restored after translation to preserve exact code-fence structure.
- If placeholder restoration is incomplete, the script falls back to the source body to avoid storing structurally corrupted markdown.

**Operational behavior:**
- Proposal rows are fetched in batches (`TRANSLATE_PROPOSALS_BATCH_SIZE`, default `100`) to avoid oversized Neon HTTP responses.
- Proposals are ordered by `created_at DESC` (newest first) so recent governance is translated before historical content.
- Low-value proposals (empty body, very short content, test/spam patterns) are skipped and permanently marked with sentinel rows so they are not re-scanned on restart.
- The script prints progress counters: translated, skipped(existing), skipped(low-value), failed, remaining.
- Bodies longer than `TRANSLATE_MAX_BODY_CHARS` are truncated before sending to the LLM; a short locale-specific footer is appended to the stored translation when that happens.
- Translation uses **two completions** only when the source body reaches `TRANSLATE_TWO_PHASE_BODY_CHARS` (default 4000 chars): (1) JSON `title` + `summary` from a short excerpt, (2) JSON `body` only. Shorter proposals use a **single** completion with `title`+`body`+`summary` JSON.
- API responses report `finish_reason` on parse failure when useful; curly-quote normalization assists JSON parsing.

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

---

## API-First Product Rule

Any new product feature must start from the API and query layer, not the page layer.

### Rules

1. Before adding a new UI feature, verify that the API/repository layer can support it with an efficient query plan
2. If the data cannot be queried efficiently, do **not** ship the page feature yet
3. In that case, first change the database schema, sync pipeline, caching strategy, repository queries, or API contract as needed
4. Only connect the feature to the page after the API can serve it efficiently and predictably
5. This rule applies to all new product features, not just search or analytics

### Practical meaning

- Do not add page features that depend on expensive full-table scans, large in-memory filtering, or ad hoc client-side data stitching
- Prefer pushing filtering, sorting, pagination, and aggregation into efficient DB/API queries
- If a proposed feature is valuable but the current API is not ready, stop at the API design/change step and defer the page integration
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

### `GET /api/themes/generate`

Returns whether server-side AI theme generation is available.

```json
{ "data": { "configured": true } }
```

`configured` is `true` when `DEEPSEEK_API_KEY` is set (same key as proposal translation).

---

### `POST /api/themes/generate`

Generates a **themed.js** token theme from a natural-language `prompt` using DeepSeek. Requires `DEEPSEEK_API_KEY`. Max prompt length: 800 characters.

**Rate limit:** one successful admission per client IP per `THEME_GENERATE_MIN_INTERVAL_MS` (default 5000 ms). Uses `X-Forwarded-For` / `X-Real-IP` when present. Exceeding returns `429` with `{ error, retryAfterSec }` and `Retry-After` header. Limiter state is in-memory (resets per server process; not shared across serverless instances).

| Body field | Type | Description |
|---|---|---|
| `prompt` | `string` | Natural-language style description |

Returns `{ data: Theme }` (themed.js theme object). Errors: `400` (bad/missing prompt), `429` (rate limited), `503` (not configured), `502` (generic message; details logged server-side only).

**Audit log:** each successful generation prints one JSON line to stdout prefixed with `[theme_generate]` (`kind`, `at`, `prompt`, `clientIp`, truncated `userAgent`, `theme`) for ops / tuning reference. Not persisted in the database.

---

### `GET /api/sources`

Returns source capability metadata for Snapshot and Tally.

---

### `GET /api/sync`

Returns grouped Snapshot and Tally sync state.

---

### Legacy `GET /api/spaces`

Snapshot-compatible alias. Prefer `GET /api/snapshot/spaces` for new source-specific clients.

| Param | Type | Description |
|---|---|---|
| `q` | `string` | Search by space name (case-insensitive) |
| `category` | `string` | Filter by category (e.g. `"DeFi"`) |
| `verified` | `"true" \| "false"` | Filter by verified status |
| `sort` | `"activity" \| "followers"` | Sort order (default: `activity`) |
| `limit` | `number` | Max results (default: 200) |

Returns: `{ data: Space[] }`

---

### Legacy `GET /api/spaces/[slug]`

Returns: `{ data: Space }` or 404.

---

### Legacy `GET /api/spaces/[slug]/proposals`

| Param | Type | Description |
|---|---|---|
| `q` | `string` | Search by proposal title or space name |
| `status` | `"Active" \| "Upcoming" \| "Closed" \| "Executed" \| "All"` | Filter by status |
| `sort` | `"time" \| "heat" \| "importance"` | Sort order |
| `limit` | `number` | Max results |

Returns: `{ data: Proposal[] }`

---

### Legacy `GET /api/proposals`

Snapshot-compatible alias. Prefer `GET /api/snapshot/proposals` for new source-specific clients. Same params as `/api/spaces/[slug]/proposals`, plus:

| Param | Type | Description |
|---|---|---|
| `spaceSlug` | `string` | Filter by space ID |
| `locale` | `string` | Overlay translated title/summary for the locale (`zh`, `ja`, `ko`) |
| `translatedOnly` | `"true" \| "false"` | When `locale != "en"`, return only proposals with an existing translation for that locale |

Returns: `{ data: Proposal[] }`

---

### Legacy `GET /api/proposals/[id]`

| Param | Type | Description |
|---|---|---|
| `locale` | `string` | If provided, overlays translation (title, summary, readableContent) |

Returns: `{ data: ProposalDetail }` or 404.

---

### Legacy `GET /api/proposals/[id]/translations`

| Param | Type | Description |
|---|---|---|
| `locale` | `string` (repeatable) | Filter to specific locales; omit for all |

Returns: `{ data: ProposalTranslation[] }` or 404 if specific locale not found.

---

### Legacy `GET /api/sync/snapshot`

| Param | Type | Description |
|---|---|---|
| `entityType` | `string` (repeatable) | Filter to `"spaces"` or `"proposals"` |

Returns: `{ data: SnapshotSyncState[] }`

---

### Legacy `GET /api/sync/tally`

| Param | Type | Description |
|---|---|---|
| `entityType` | `string` (repeatable) | Filter to `"organizations"`, `"proposals"`, `"tally:organizations"`, or `"tally:proposals"` |

Returns: `{ data: SnapshotSyncState[] }`

---

### Source-specific APIs

Snapshot-compatible source routes:

```txt
GET /api/snapshot/spaces
GET /api/snapshot/spaces/[slug]
GET /api/snapshot/spaces/[slug]/proposals
GET /api/snapshot/proposals
GET /api/snapshot/proposals/[id]
GET /api/snapshot/proposals/[id]/translations
GET /api/snapshot/sync
```

Tally source routes:

```txt
GET /api/tally/organizations
GET /api/tally/organizations/[idOrSlug]
GET /api/tally/organizations/[idOrSlug]/proposals
GET /api/tally/proposals
GET /api/tally/proposals/[id]
GET /api/tally/sync
```

### Planned aggregate APIs

The multi-source aggregate API is partially implemented. `GET /api/sources`, `GET /api/sync`, `GET /api/protocols`, `GET /api/protocols/[id]`, `GET /api/protocols/[id]/sources`, and `GET /api/protocols/[id]/proposals` are available. Use `docs/1. governance-aggregation-api.md` as the contract source before changing aggregate `/api/proposals`.

Rules:
- All aggregate entities must expose `source`, `sourceId`, and source-scoped `uid`
- Do not break existing `/api/spaces` or `/api/proposals` while adding aggregate routes
- Keep Snapshot translation overlay behavior source-aware; current `proposal_translations` rows are Snapshot-scoped

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

**SQL pushdown:** `spaceSlug`, `status`, `q` (ilike on title/space name), locale-aware translation joins (including `translatedOnly`), and time-ordered `LIMIT` are pushed to SQL `WHERE`/`JOIN`/`ORDER BY`. Heat, importance sort, and category filter are applied in-memory on a capped result set.

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

---

## SQL Performance Notes

### Index design

| Table | Index | Purpose |
|---|---|---|
| `snapshot_spaces` | `verified_activity` (partial `WHERE flagged=false AND verified=true`) | Primary space-list query — `ORDER BY proposal_count DESC, member_count DESC, name` with LIMIT |
| `snapshot_spaces` | `name_trgm` (GIN) | `ILIKE '%query%'` search |
| `snapshot_spaces` | `categories_gin` (GIN) | `categories @> '["protocol"]'` filter |
| `snapshot_proposals` | `feed` (partial `WHERE flagged=false`) | Home page proposal feed — `ORDER BY created_at DESC` |
| `snapshot_proposals` | `space_feed` (partial `WHERE flagged=false`) | Space detail page proposals — `(space_id, created_at DESC)` |
| `snapshot_proposals` | `title_trgm` (GIN) | `ILIKE '%query%'` search |
| `snapshot_proposals` | `created_ts` (DESC) | `SELECT MAX(created_ts)` watermark reads |
| `snapshot_sync_runs` | `latest` composite `(entity_type, created_at DESC)` | `SELECT DISTINCT ON (entity_type) ... ORDER BY entity_type, created_at DESC` |

### Query patterns

- **Space list** — Default path (verified=true, no locale, no search) hits `verified_activity` partial index → Index Only Scan → LIMIT. Locale-aware queries add `LEFT JOIN space_translations` which requires a Bitmap Scan + Sort.
- **Proposal list** — Default path hits `feed` partial index → Nested Loop JOIN spaces → LIMIT. Status-filtered queries use `state` index.
- **Search** — Uses CTE pipeline: `title_matches` (GIN trigram) UNION `space_proposal_matches` (space join) → final JOIN + ORDER BY + LIMIT. Intermediate sorts were removed — they were redundant with the final `ORDER BY`.
- **Sync state reads** — `DISTINCT ON (entity_type) ... ORDER BY entity_type, created_at DESC` uses the composite `latest` index for Index Only Scan.

### Batch writes

All Snapshot proposal sync scripts use **batch upsert** via `upsertProposalsBatch()` instead of row-by-row `upsertProposal()`. The batch function:

1. Collects proposals into a buffer
2. Flushes every 100 rows as a single `INSERT INTO ... VALUES (...), (...) ON CONFLICT DO UPDATE SET ...`
3. Uses parameterized `neon().unsafe()` (raw SQL) because Drizzle ORM's `onConflictDoUpdate` doesn't support per-row different values in batch mode

Key files:
- `scripts/sync-snapshot-shared.ts` — `upsertProposalsBatch(databaseUrl, proposals[])` and `upsertProposal(db, proposal)` (single-row, kept for compatibility)
- `scripts/sync-snapshot-proposals.ts` — 3 stages (new, active, recent-closed) each flush after every API page
- `scripts/sync-snapshot-backfill.ts` — `runBackfill` flushes per page; `syncTargetedProposals` flushes every 100 targeted IDs

`refreshSpaceProposalCounts` also uses a single `UPDATE ... FROM (SELECT ... GROUP BY) WHERE id = subq.sid` instead of N individual UPDATEs.

---

## Deployment

The application is deployed on **Vercel** (Serverless Functions).

### Runtime constraints

- Serverless Functions are stateless containers — **no in-memory caching** between requests. Each invocation may land on a different instance.
- Neon (serverless Postgres) uses HTTP transport: queries complete in ~2–5ms under normal conditions, making an in-memory cache layer unnecessary on Vercel.
- `unstable_cache` (Next.js) persists across Serverless Function instances via Vercel's global cache layer. It works for Server Component data fetching (`page.tsx`) but does **not** apply to API route handlers (`/api/*`).

---

## Caching Strategy

The caching approach accounts for the Vercel Serverless architecture:

| Layer | Scope | When it applies |
|---|---|---|
| `unstable_cache` (Next.js) | Server Component renders | Static/dynamic page generation via `page.tsx` |
| HTTP `Cache-Control` headers | API route responses | CDN-level caching (Vercel Edge Network / Cloudflare) |

### Server Component caching

`lib/repository.ts` wraps the main data-fetching entry points with `unstable_cache`:

```typescript
const getCachedSpaces = unstable_cache(fetchSpaces, ["spaces-list"], { revalidate: 120, tags: ["spaces", "translations"] });
const getCachedProposals = unstable_cache(fetchProposals, ["proposals-list"], { revalidate: 60, tags: ["proposals", "spaces", "translations"] });
```

- `listSpaces(query)` → `getCachedSpaces(normalizeSpaceFilters(query))`
- `listProposals(query)` → `getCachedProposals(normalizeProposalFilters(query))`
- `getPlatformStats()` → `getCachedPlatformStats()`

Cache tags enable fine-grained invalidation via `revalidateTag()`.

### API route HTTP caching

All `/api/*` route handlers set:
```
Cache-Control: public, s-maxage=<N>, stale-while-revalidate=<3xN>
```

- `/api/snapshot/spaces`: s-maxage=120s
- `/api/snapshot/proposals`: s-maxage=60s

Client components fetch from `/api/snapshot/*`. These requests bypass `unstable_cache` and rely on Vercel's Edge Network CDN to absorb repeated requests.

### Cache invalidation

The `unstable_cache` tags allow programmatic revalidation. A sync webhook or deployment hook can call:

```typescript
import { revalidateTag } from "next/cache";
revalidateTag("spaces");  // busts all space caches
revalidateTag("proposals"); // busts all proposal caches
```

---

## Error Handling

### Database error logging

All `fetch*` functions in `lib/repository.ts` wrap their DB queries in try/catch and call `logDbError(context, error)` before returning empty fallback values. This ensures database errors are visible in Vercel Function logs rather than silently swallowed.

**`logDbError(context, error)`** (defined at top of `lib/repository.ts`) logs to `console.error` with the function name and first 3 lines of stack trace.

### Graceful degradation

- Most fetch functions return `[]` or `null` on error → UI shows empty state, never crashes
- `fetchPlatformStats` has a two-tier fallback: tries `platform_stats` table → falls through to live aggregate queries → returns `emptyPlatformStats()` if both fail
