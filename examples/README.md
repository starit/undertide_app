# Examples

These scripts call the local REST API and print compact response summaries. Start the app first:

```bash
pnpm dev
```

Use `--base-url` or `API_BASE_URL` when the app is not running on `http://localhost:3000`.

## Snapshot API

Calls common Snapshot source-specific routes:

- `GET /api/snapshot/sync`
- `GET /api/snapshot/spaces`
- `GET /api/snapshot/spaces/[slug]`
- `GET /api/snapshot/spaces/[slug]/proposals`
- `GET /api/snapshot/proposals`
- `GET /api/snapshot/proposals/[id]`
- `GET /api/snapshot/proposals/[id]/translations`

```bash
pnpm example:api:snapshot
pnpm example:api:snapshot -- --limit 3
pnpm example:api:snapshot -- --q arbitrum --locale zh
pnpm example:api:snapshot -- --space aave.eth --proposal-id <snapshotProposalId>
```

## Tally API

Calls common Tally source-specific routes:

- `GET /api/tally/sync`
- `GET /api/tally/organizations`
- `GET /api/tally/organizations/[idOrSlug]`
- `GET /api/tally/organizations/[idOrSlug]/proposals`
- `GET /api/tally/proposals`
- `GET /api/tally/proposals/[id]`

```bash
pnpm example:api:tally
pnpm example:api:tally -- --limit 3
pnpm example:api:tally -- --q uniswap --status ACTIVE
pnpm example:api:tally -- --organization uniswap --proposal-id <tallyProposalId>
```

## Aggregate API

Calls implemented aggregate discovery and protocol routes:

- `GET /api/sources`
- `GET /api/sync`
- `GET /api/protocols`
- `GET /api/protocols/[id]`
- `GET /api/protocols/[id]/sources`
- `GET /api/protocols/[id]/proposals`

```bash
pnpm example:api:aggregate
pnpm example:api:aggregate -- --limit 3
pnpm example:api:aggregate -- --q uniswap --source tally
pnpm example:api:aggregate -- --protocol uniswap --status-group Active --sort heat
```

Top-level aggregate `GET /api/proposals` is still planned; current `GET /api/proposals` remains legacy Snapshot-compatible.

## Help

Each script prints its own usage:

```bash
pnpm example:api:snapshot -- --help
pnpm example:api:tally -- --help
pnpm example:api:aggregate -- --help
```

## Spaces Benchmark

Benchmark the legacy Snapshot-compatible spaces API:

```bash
npx tsx examples/benchmark-spaces-api.ts
npx tsx examples/benchmark-spaces-api.ts --limit 200 --runs 5 --sort activity --q arbitrum
```
