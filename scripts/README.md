# Scripts Guide

This directory contains operational scripts for sync, backfill, migration, and translation tasks.

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
- **Long bodies:** source body may be truncated to `TRANSLATE_MAX_BODY_CHARS` before sending. Proposals with body length **≥ `TRANSLATE_TWO_PHASE_BODY_CHARS`** (default `4000`) use **two** DeepSeek completions (title+summary excerpt, then body only). Shorter proposals use **one** completion with a single JSON `{ title, body, summary }`.

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

**Optional — LLM sizing (tune when bodies are huge or responses truncate)**

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRANSLATE_MAX_BODY_CHARS` | `12000` | Max source characters sent to the model (remainder truncated with a marker). |
| `TRANSLATE_TWO_PHASE_BODY_CHARS` | `4000` | If **truncated** body length ≥ this, run two-phase translation; otherwise one-shot JSON. Lower this if single-shot responses still truncate. |
| `TRANSLATE_MAX_TOKENS` | `8192` | `max_tokens` for **single-shot** completion and for **phase-2 body-only** completion. |
| `TRANSLATE_MAX_TOKENS_META` | `3072` | `max_tokens` for **phase-1** title + short excerpt summary JSON. |

### Troubleshooting

- **`DeepSeek invalid JSON` / truncated JSON in logs:** often output hit `max_tokens`. Try raising `TRANSLATE_MAX_TOKENS` and/or **`TRANSLATE_TWO_PHASE_BODY_CHARS`** so more proposals use two-phase mode; reduce `TRANSLATE_MAX_BODY_CHARS` only if inputs are absurdly large.
- **`finish_reason=length`:** completion was cut off; same tuning as above.
- **Many `skipped(low-value)`:** expected for old junk proposals; sentinels prevent endless retries.

For repository-wide conventions, see also [`AGENTS.md`](../AGENTS.md) (translate section).
