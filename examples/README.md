# Examples

## Benchmark the spaces API locally

Start the local app first:

`pnpm dev`

Then run:

`node --experimental-strip-types examples/benchmark-spaces-api.ts`

Optional flags:

- `--base-url http://localhost:3000`
- `--limit 200`
- `--runs 5`
- `--sort activity`
- `--q arbitrum`
