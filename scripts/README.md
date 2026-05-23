# Scripts Guide

This directory contains operational scripts for sync, backfill, migration, and translation tasks.

## Snapshot Sync — Data Maintenance Guide

The Snapshot sync is split into three scripts with clearly separated responsibilities.

### First-time setup

Run these once in order when setting up a fresh database:

```bash
pnpm sync:snapshot:spaces      # sync all spaces (incremental after first run)
pnpm sync:snapshot:backfill    # full historical proposal scan, newest → oldest
                               # safe to interrupt and resume; takes hours on first run
pnpm sync:snapshot:proposals   # verify incremental watermark was seeded correctly
pnpm link:protocols            # build protocol links from synced data
pnpm translate:proposals --limit 1000000  # backfill translations (optional, slow)
```

---

### 1. Daily incremental sync (run frequently, e.g. every 10–30 minutes)

Fetches only what has changed since the last run:
- **New spaces** — watermark derived automatically from `MAX(raw->>'created')` in the local DB; no state file needed
- **New proposals** created after the stored watermark
- **Active proposals** re-fetched to keep votes and scores current
- **Recently closed proposals** (ended in the last 48 h) re-fetched to capture finalized scores

```bash
pnpm sync:snapshot:spaces                        # stateless — derives watermark from DB automatically
pnpm sync:snapshot:proposals --from-db           # derives watermark from MAX(created_ts) in DB
```

Or run both at once via the orchestrator:

```bash
pnpm sync:snapshot
```

**Notes:**
- `sync:snapshot:spaces` automatically does a full scan on first run (empty table) and incremental on subsequent runs. No configuration needed.
- `sync:snapshot:proposals --from-db` derives the watermark from the actual data in `snapshot_proposals`, so it can never go stale or corrupt. Recommended over relying on the stored sync state.
- Platform stats are refreshed automatically at the end of each run.

---

### 2. Monthly full re-sync (run once a month or when data gaps are suspected)

Re-scans the entire Snapshot proposal history to catch anything the incremental sync may have missed (e.g. proposals updated retroactively, edge-case gaps):

```bash
pnpm sync:snapshot:backfill
```

The backfill tracks its own cursor under the `"proposals-backfill"` state entity, completely separate from the incremental sync state. You can safely run it while the incremental sync continues to operate.

To limit the scan to a recent window (e.g. last 90 days) rather than all history:

```bash
# --stop-at accepts a Unix timestamp
pnpm sync:snapshot:backfill --stop-at $(date -v-90d +%s)   # macOS
pnpm sync:snapshot:backfill --stop-at $(date -d '90 days ago' +%s)  # Linux
```

**Notes:**
- Safe to interrupt. Re-run the same command to resume from where it stopped.
- Does not affect the incremental watermark unless it completes fully and no watermark exists yet.
- After a full backfill, re-run `pnpm link:protocols` to refresh protocol links.

---

### 3. Targeted sync — fix a specific space or proposal

Use when you notice a single record is missing or stale and don't want to wait for the next scheduled run.

**Sync one or more spaces:**

```bash
pnpm sync:snapshot:spaces --space-id uniswap.eth
pnpm sync:snapshot:spaces --space-id uniswap.eth --space-id aave.eth
```

**Sync one or more proposals:**

```bash
pnpm sync:snapshot:backfill --proposal-id 0xabc123…
pnpm sync:snapshot:backfill --proposal-id 0xabc123… --proposal-id 0xdef456…
```

Both commands upsert the record(s) immediately and refresh the affected space proposal counts. They do not modify the incremental watermark or backfill cursor.

To also re-translate a proposal after syncing:

```bash
npx tsx scripts/translate-proposals.ts --proposal-id 0xabc123… --overwrite
```

---

### 4. Post-sync protocol linking

Run after any sync that adds new spaces or proposals to rebuild the `governance_protocols` / `governance_protocol_sources` tables:

```bash
pnpm link:protocols
```

This is read-only against the Snapshot/Tally tables and safe to run at any time.

---

### Sync state reference

Run history is stored in `snapshot_sync_state` (keyed by `entity_type`) and `snapshot_sync_runs`:

| Entity type | Managed by | What is tracked |
|---|---|---|
| `spaces` | `sync-snapshot-spaces.ts` | `last_success_at`, `last_error` only — watermark is derived live from the DB, not stored |
| `proposals` | `sync-snapshot-proposals.ts` | `last_created_ts` (incremental watermark) |
| `proposals-backfill` | `sync-snapshot-backfill.ts` | `last_cursor` (backfill pagination cursor, independent of incremental) |

To inspect current state:

```sql
SELECT entity_type, last_success_at, last_created_ts, last_cursor, last_error
FROM snapshot_sync_state
ORDER BY entity_type;
```

**Spaces watermark** is always `MAX((raw->>'created')::bigint)` from `snapshot_spaces` — it cannot go stale or corrupt. Use `--full` to force a complete re-scan if needed.

To reset the proposals incremental watermark and force a re-fetch from a specific date (use with care):

```sql
-- Example: reset to 30 days ago
UPDATE snapshot_sync_state
SET last_created_ts = EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days')::bigint,
    last_cursor = NULL
WHERE entity_type = 'proposals';
```

---

### CLI flag reference

**`sync-snapshot-spaces.ts`**

| Flag | Description |
|---|---|
| `--space-id <id>` | Fetch and upsert a specific space. Repeatable. Skips normal sync. |
| `--full` | Force a full scan from the beginning, ignoring the DB watermark. |

**`sync-snapshot-proposals.ts`**

| Flag | Description |
|---|---|
| `--from-db` | Derive the watermark from `MAX(created_ts)` in the `snapshot_proposals` table instead of trusting the sync state. Persists the derived value so future runs use it automatically. Best first step when the watermark is suspected to be stale or corrupted. |
| `--force` | Run even if no watermark exists; falls back to a 7-day window. |
| `--since <unix_ts>` | Override the stored watermark for this run only (not persisted). |
| `--reset-watermark <unix_ts>` | Permanently overwrite the stored watermark and exit without syncing. |

**`sync-snapshot-backfill.ts`**

| Flag | Description |
|---|---|
| `--proposal-id <id>` | Fetch and upsert a specific proposal. Repeatable. Skips full backfill. |
| `--stop-at <unix_ts>` | Stop scanning once proposals older than this timestamp are reached. |

---

---

### Troubleshooting — incremental sync starts from years ago

**Symptom:** `sync:snapshot:proposals` logs show it fetching proposals from a very old date (e.g. 2020), even though sync has been running for a long time.

**Root cause:** The previous version of `sync-snapshot.ts` had a cursor/watermark race condition. If a full scan was interrupted, the resumed run processed only old proposals and wrote their timestamp as the watermark — resulting in a valid-looking but years-old `last_created_ts`.

The script now detects this and refuses to run if the stored watermark is older than 90 days, printing instructions. If it's older than 30 days it warns but still proceeds.

**Fix — use `--from-db` (recommended, and the standard daily usage)**

```bash
pnpm sync:snapshot:proposals --from-db
```

Reads `MAX(created_ts)` from `snapshot_proposals`, saves it as the new watermark, then syncs from that point forward. This is also the recommended command for routine incremental syncs — it can never go stale.

**Fix — option 2: manually reset the watermark to a specific date**

```bash
# Reset to 3 days ago (macOS)
pnpm sync:snapshot:proposals --reset-watermark $(date -v-3d +%s)

# Reset to 3 days ago (Linux)
pnpm sync:snapshot:proposals --reset-watermark $(date -d '3 days ago' +%s)

# Then run the incremental sync normally
pnpm sync:snapshot:proposals
```

Or via SQL:

```sql
UPDATE snapshot_sync_state
SET last_created_ts = EXTRACT(EPOCH FROM NOW() - INTERVAL '3 days')::bigint,
    last_cursor = NULL
WHERE entity_type = 'proposals';
```

**One-off recovery run (without permanently changing the watermark):**

```bash
# Sync from 3 days ago for this run only; watermark advances normally from there
pnpm sync:snapshot:proposals --since $(date -v-3d +%s)   # macOS
pnpm sync:snapshot:proposals --since $(date -d '3 days ago' +%s)   # Linux
```

---

### Environment variables (Snapshot sync)

| Variable | Purpose |
|---|---|
| `DATABASE_URL_UNPOOLED` | Preferred for scripts (direct Neon connection, no pooler). |
| `DATABASE_URL` | Fallback if unpooled is unset. |



## Link Governance Protocols (`link-governance-protocols.ts`)

Script path: [`link-governance-protocols.ts`](./link-governance-protocols.ts).  
pnpm shortcut: **`pnpm link:protocols`** → `npx tsx scripts/link-governance-protocols.ts`.

Reads already-synced Snapshot spaces and Tally organizations, then writes canonical protocol rows and source refs:

- `governance_protocols`
- `governance_protocol_sources`

This script does not call external APIs. Run it after source sync.

### Common commands

```bash
pnpm link:protocols --dry-run --limit 50
pnpm link:protocols --min-proposals 1
pnpm link:protocols --source snapshot --limit 1000
pnpm link:protocols --source tally --limit 1000
pnpm link:protocols --seed-file data/governance-protocol-sources.json
pnpm link:protocols --skip-seed
```

### CLI flags

| Flag | Description |
| --- | --- |
| `--dry-run` | Print proposed source links without writing rows. |
| `--source <source>` | `snapshot`, `tally`, or `all` (default). |
| `--limit <n>` | Max source rows per source. Default `5000`. |
| `--min-proposals <n>` | Only link source objects with at least this many proposals. Default `0`. |
| `--seed-file <path>` | Manual protocol source seed file. Default `data/governance-protocol-sources.json`. |
| `--skip-seed` | Skip manual seed application and run automatic linking only. |

Manual seed rows run before automatic linking. Automatically generated links preserve existing manual source refs instead of overwriting them.

## Tally Sync (`sync-tally.ts`)

Script path: [`sync-tally.ts`](./sync-tally.ts).  
pnpm shortcut: **`pnpm sync:tally`** → `npx tsx scripts/sync-tally.ts`.

Writes Tally governance data into raw source tables:

- `tally_organizations`
- `tally_proposals`

The script uses Tally governance GraphQL at `https://api.tally.xyz/query` by default. It records progress in the existing sync-state tables with source-scoped entity types: `tally:organizations` and `tally:proposals`. This keeps the current Snapshot API untouched while leaving a stable source dimension for the future aggregate governance API.

The aggregate API contract is documented in [`docs/1. governance-aggregation-api.md`](../docs/1.%20governance-aggregation-api.md).

### Common commands

```bash
pnpm sync:tally
pnpm sync:tally --organizations-only --limit-organizations 200
pnpm sync:tally --organization-slug uniswap --limit-proposals 100
pnpm sync:tally:full --organization-slug uniswap
```

### CLI flags

| Flag | Description |
| --- | --- |
| `--full` | Do not resume organization cursor; remove the default per-organization proposal cap. |
| `--organizations-only` | Sync Tally organizations only. |
| `--proposals-only` | Sync Tally proposals only, using organizations already present in `tally_organizations`. |
| `--organization-id <id>` | Restrict organization/proposal work to a specific Tally organization id. Repeatable. |
| `--organization-slug <slug>` | Restrict organization/proposal work to a specific Tally organization slug. Repeatable. |
| `--limit-organizations <n>` | Max organizations to fetch from Tally in this run. |
| `--limit-proposals <n>` | Max proposals per organization unless `--full` is used. |
| `--proposal-organization-limit <n>` | Max stored organizations to scan for proposal sync when no explicit organization filter is provided. |

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `TALLY_API_KEY` | Required | Tally API key. |
| `TALLY_API_URL` | `https://api.tally.xyz/query` | Override Tally GraphQL endpoint. |
| `TALLY_PAGE_SIZE` | `20` | GraphQL page size, capped at 20. |
| `TALLY_ORGANIZATION_LIMIT` | `100` | Default organization fetch cap. |
| `TALLY_PROPOSALS_PER_ORGANIZATION` | `20` | Default proposal cap per organization. |
| `TALLY_PROPOSAL_ORGANIZATION_LIMIT` | `50` | Default number of stored organizations scanned for proposals. |
| `DATABASE_URL_UNPOOLED` | Required | Preferred for scripts. |
| `DATABASE_URL` | Fallback | Used if unpooled is unset. |

## Translate Proposals (`translate-proposals.ts`)

Script path: [`translate-proposals.ts`](./translate-proposals.ts).  
pnpm shortcut: **`pnpm translate:proposals`** → `npx tsx scripts/translate-proposals.ts` (same flags).

Writes into table **`proposal_translations`** (title, body, summary per locale). Target locales are **`zh`**, **`ja`**, **`ko`** only (see `localeConfigs` in the script).

### What it does

- Translates each proposal’s **title**, **body**, and **summary** (summary is derived from a short excerpt of the body for the LLM).
- **Default locales:** `zh`, `ja`, `ko` if you omit `--locale`. Pass `--locale` one or more times to restrict (e.g. only `zh`).
- **No overwrite by default:** existing rows for a `(proposal_id, locale)` are skipped unless you pass **`--overwrite`**.
- **Order:** proposals are processed by **`created_at` descending** (newest first).
- **SQL filter (when not `--overwrite`):** only rows that are still missing **at least one** of the requested locales are selected, so restarts do not scan already-fully-translated proposals.
- **Batches:** DB reads use `TRANSLATE_PROPOSALS_BATCH_SIZE` (default `100`) to avoid huge HTTP responses.
- **Low-value skip:** very short / empty / pattern-matched junk is skipped; **sentinel** rows (`translated_by = skipped:low-value`) are inserted for skipped locales so those proposals are not re-queued forever.
- **Markdown:** fenced code blocks are replaced with `[[CODE_BLOCK_n]]` placeholders before the LLM call and restored afterward; if restoration fails, the script falls back to the source body.
- **Long bodies:** source body may be truncated to `TRANSLATE_MAX_BODY_CHARS` before sending (default is high; the model’s context window is the practical ceiling). Proposals with body length **≥ `TRANSLATE_TWO_PHASE_BODY_CHARS`** (default `4000`) use **two** DeepSeek completions (title+summary excerpt, then body only). Shorter proposals use **one** completion with a single JSON `{ title, body, summary }`.

### CLI flags

| Flag | Description |
| --- | --- |
| `--proposal-id <id>` | Translate exactly one proposal (64-char hex id). Ignores bulk `limit` for row count (still pass `--limit` if your shell needs it; processing is 1 proposal). |
| `--locale <code>` | Target locale; repeat for multiple (e.g. `--locale zh --locale ja`). Omit for all three: `zh`, `ja`, `ko`. |
| `--limit <n>` | Max proposals to process in this run (default from env `TRANSLATE_PROPOSALS_LIMIT`, or **10** if unset). Use a large number (e.g. `1000000`) for “effectively all pending”. |
| `--overwrite` | Replace existing `proposal_translations` rows for the selected locales instead of skipping. |

### Common commands

Backfill as many missing translations as the DB still needs (single locale):

```bash
pnpm translate:proposals --locale zh --limit 1000000
```

Same with `npx`:

```bash
npx tsx scripts/translate-proposals.ts --locale zh --limit 1000000
```

Default three locales, large limit:

```bash
pnpm translate:proposals --limit 1000000
```

One proposal only (debug or hotfix):

```bash
npx tsx scripts/translate-proposals.ts --proposal-id 0x… --locale zh
```

Force re-translate and overwrite existing Chinese rows:

```bash
npx tsx scripts/translate-proposals.ts --locale zh --overwrite --limit 1000000
```

### Rows that look “truncated” (re-translate after raising limits or fixing markers)

The translate script used to embed an English truncation marker inside the body (sometimes model-translated into Chinese). Newer runs append a short **footer** instead when the source body exceeds `TRANSLATE_MAX_BODY_CHARS`. To **list** `proposal_translations` rows whose stored `body` still contains those artifacts (read-only SQL scan):

```bash
pnpm list:retranslate-candidates
# or: npx tsx scripts/list-retranslate-candidates.ts
```

Useful flags:

| Flag | Example | Purpose |
| --- | --- | --- |
| `--locale` | `--locale zh` | Repeat to filter locales. |
| `--limit` | `--limit 20000` | Cap rows (default 5000, max 100000). |
| `--format` | `table` (default), `json`, `csv`, `pairs`, `commands` | `pairs` = `proposal_id<TAB>locale` per line; `commands` = one full `translate-proposals.ts … --overwrite` line per row (review before piping to `sh`). |

**Re-translate and update the database** for one proposal + locale (upserts `proposal_translations`):

```bash
npx tsx scripts/translate-proposals.ts --proposal-id 0x… --locale zh --overwrite
```

Batch from saved pairs (example):

```bash
pnpm list:retranslate-candidates --format pairs --locale zh > /tmp/retranslate-pairs.txt
while IFS=$'\t' read -r id loc; do
  [ -z "$id" ] && continue
  npx tsx scripts/translate-proposals.ts --proposal-id "$id" --locale "$loc" --overwrite
done < /tmp/retranslate-pairs.txt
```

Ensure `TRANSLATE_MAX_BODY_CHARS` / `TRANSLATE_MAX_TOKENS` in `.env` match what you want **before** running overwrite passes.

### Re-runs and interrupts

You usually **do not** need multiple passes if `--limit` is large enough. If the process stops (network, Ctrl+C, rate limits), run the **same command again**: the SQL filter selects only proposals that still lack translations for your target locales(s), so work continues where it left off.

### Progress log meaning

Startup line prints: `scope`, target `locales`, `overwrite`, `batchSize`.

Progress lines include:

- **`translated`** — successful inserts/updates into `proposal_translations`
- **`skipped(existing)`** — locale already present and `--overwrite` not set
- **`skipped(low-value)`** — heuristic skip (short/spam-like); see script for sentinel inserts
- **`failed`** — API/JSON error for that `(proposal, locale)`
- **`remaining`** — outstanding locale targets in the planned batch

### Environment variables

**Required**

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL_UNPOOLED` | Preferred for scripts (direct Neon). |
| `DATABASE_URL` | Fallback if unpooled unset. |
| `DEEPSEEK_API_KEY` | DeepSeek API key. |

**Optional — DeepSeek**

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | API base URL. |
| `DEEPSEEK_MODEL` | `deepseek-chat` | Model id. |

**Optional — batching / limits**

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRANSLATE_PROPOSALS_LIMIT` | `10` | Default `--limit` when the flag is omitted. |
| `TRANSLATE_PROPOSALS_BATCH_SIZE` | `100` | Rows fetched per DB batch. |

**Optional — LLM sizing (defaults favour completeness; lower only if you hit provider errors or cost caps)**

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRANSLATE_MAX_BODY_CHARS` | `250000` | Max source characters sent to the model; remainder is not translated (footer added). |
| `TRANSLATE_TWO_PHASE_BODY_CHARS` | `4000` | If **truncated** body length ≥ this, run two-phase translation; otherwise one-shot JSON. Lower this if single-shot responses still truncate. |
| `TRANSLATE_MAX_TOKENS` | `32768` | `max_tokens` for **single-shot** completion and for **phase-2 body-only** completion. |
| `TRANSLATE_MAX_TOKENS_META` | `16384` | `max_tokens` for **phase-1** title + short excerpt summary JSON. |

### Troubleshooting

- **`DeepSeek invalid JSON` / truncated JSON in logs:** often output hit `max_tokens` or context limits. Try raising `TRANSLATE_MAX_TOKENS` / `TRANSLATE_MAX_TOKENS_META` and/or **`TRANSLATE_TWO_PHASE_BODY_CHARS`** so more proposals use two-phase mode; if the API rejects huge requests, lower `TRANSLATE_MAX_BODY_CHARS`.
- **`finish_reason=length`:** completion was cut off; same tuning as above.
- **Many `skipped(low-value)`:** expected for old junk proposals; sentinels prevent endless retries.

For repository-wide conventions, see also [`AGENTS.md`](../AGENTS.md) (translate section).
