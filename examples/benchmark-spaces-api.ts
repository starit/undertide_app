const baseUrl = readArgValue("--base-url") ?? process.env.API_BASE_URL ?? "http://localhost:3000";
const limit = Number(readArgValue("--limit") ?? "200");
const runs = Number(readArgValue("--runs") ?? "3");
const sort = readArgValue("--sort") ?? "activity";
const includeQuery = readArgValue("--q");

async function main() {
  const searchParams = new URLSearchParams({
    limit: String(limit),
    sort,
  });

  if (includeQuery) {
    searchParams.set("q", includeQuery);
  }

  const url = `${baseUrl}/api/spaces?${searchParams.toString()}`;
  console.log(`[bench] target=${url}`);

  const samples: number[] = [];

  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    const response = await fetch(url, { cache: "no-store" });
    const elapsed = performance.now() - startedAt;
    const text = await response.text();
    const bytes = Buffer.byteLength(text);
    const json = JSON.parse(text) as { data?: unknown[] };
    const rows = Array.isArray(json.data) ? json.data.length : 0;

    samples.push(elapsed);
    console.log(
      `[bench] run=${index + 1} status=${response.status} time=${elapsed.toFixed(1)}ms rows=${rows} bytes=${bytes}`
    );
  }

  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const slowest = Math.max(...samples);
  const fastest = Math.min(...samples);

  console.log(
    `[bench] summary avg=${average.toFixed(1)}ms fastest=${fastest.toFixed(1)}ms slowest=${slowest.toFixed(1)}ms`
  );
}

function readArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

void main().catch((error) => {
  console.error("[bench] failed", error);
  process.exit(1);
});
