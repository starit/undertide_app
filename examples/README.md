# Examples

## Benchmark the spaces API locally

Start the local app first:

`pnpm dev`

Then run:

`npx tsx examples/benchmark-spaces-api.ts`

Optional flags:

- `--base-url http://localhost:3000`
- `--limit 200`
- `--runs 5`
- `--sort activity`
- `--q arbitrum`
