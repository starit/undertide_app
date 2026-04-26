# Scripts Guide

This directory contains operational scripts for sync, backfill, migration, and translation tasks.

## Translate Proposals

Script: `scripts/translate-proposals.ts`

### What it does

- Translates proposal `title`, `body`, and `summary` into target locales.
- Default locales are `zh`, `ja`, and `ko`.
- By default, it only fills missing translations (it does not overwrite existing rows unless you pass `--overwrite`).
- Processes proposals in batches to avoid oversized DB responses.
- Prints progress with translated/skipped/failed/remaining counters.
- Skips empty/low-value test-like content before calling the LLM.
- Preserves fenced code block structure in markdown body translations.

### Run once to backfill all missing translations

Use a very large limit so one run can cover the full dataset:

```bash
pnpm translate:proposals --limit 1000000
```

Equivalent command:

```bash
npx tsx scripts/translate-proposals.ts --limit 1000000
```

### Do I need to run it multiple times?

- Usually no, if your `--limit` is large enough.
- If the run is interrupted (API/network/rate limit), just run the same command again.
- The script will continue filling only still-missing locale rows.

### Progress and skip behavior

- Startup log shows scope, locales, overwrite mode, and batch size.
- Progress log includes:
  - `translated`
  - `skipped(existing)`
  - `skipped(low-value)`
  - `failed`
  - `remaining`
- Existing translations are skipped unless `--overwrite` is used.
- Empty or obvious low-value test content is skipped before translation.

### Common usage

Translate one specific proposal:

```bash
npx tsx scripts/translate-proposals.ts --proposal-id <proposal_id>
```

Translate only one locale:

```bash
npx tsx scripts/translate-proposals.ts --locale zh --limit 1000000
```

Force re-translate and overwrite existing translations:

```bash
npx tsx scripts/translate-proposals.ts --locale zh --overwrite --limit 1000000
```

### Environment variables

Required:

- `DEEPSEEK_API_KEY`
- `DATABASE_URL_UNPOOLED` (preferred) or `DATABASE_URL`

Optional:

- `DEEPSEEK_BASE_URL` (default: `https://api.deepseek.com`)
- `DEEPSEEK_MODEL` (default: `deepseek-chat`)
- `TRANSLATE_PROPOSALS_BATCH_SIZE` (default: `100`) - proposals fetched per DB batch
