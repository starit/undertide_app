type QueryValue = string | number | boolean | null | undefined;

export type ApiResponse = {
  data?: unknown;
  error?: string;
  pageInfo?: unknown;
  meta?: unknown;
  [key: string]: unknown;
};

export function getBaseUrl() {
  return readArgValue("--base-url") ?? process.env.API_BASE_URL ?? "http://localhost:3000";
}

export function getLimit(defaultValue = 5) {
  return readNumberArg("--limit") ?? defaultValue;
}

export function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

export function readArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

export function readNumberArg(flag: string) {
  const raw = readArgValue(flag);
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildApiUrl(baseUrl: string, path: string, query: Record<string, QueryValue> = {}) {
  const url = new URL(path, baseUrl);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

export async function requestJson(label: string, url: string): Promise<ApiResponse> {
  const startedAt = performance.now();
  const response = await fetch(url, { cache: "no-store" });
  const elapsed = performance.now() - startedAt;
  const text = await response.text();
  const bytes = Buffer.byteLength(text);
  const json = parseJson(text);

  console.log(`\n[${label}] GET ${url}`);
  console.log(`[${label}] status=${response.status} time=${elapsed.toFixed(1)}ms bytes=${bytes}`);

  if (!response.ok) {
    console.log(`[${label}] error=${readObjectString(json, "error") ?? text.slice(0, 240)}`);
    return json;
  }

  printSummary(label, json);
  return json;
}

export function dataArray(response: ApiResponse) {
  return Array.isArray(response.data) ? response.data : [];
}

export function dataObject(response: ApiResponse) {
  return response.data && typeof response.data === "object" && !Array.isArray(response.data)
    ? (response.data as Record<string, unknown>)
    : null;
}

export function readObjectString(value: unknown, key: string) {
  if (!value || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

export function firstString(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function printUsage(title: string, lines: string[]) {
  console.log(title);
  console.log("");
  for (const line of lines) {
    console.log(line);
  }
}

function parseJson(text: string): ApiResponse {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as ApiResponse) : { data: parsed };
  } catch {
    return { error: text };
  }
}

function printSummary(label: string, response: ApiResponse) {
  const rows = dataArray(response);
  if (rows.length > 0) {
    console.log(`[${label}] rows=${rows.length}`);
    console.log(`[${label}] first=${JSON.stringify(summarizeObject(rows[0]), null, 2)}`);
    return;
  }

  const object = dataObject(response);
  if (object) {
    console.log(`[${label}] data=${JSON.stringify(summarizeObject(object), null, 2)}`);
    return;
  }

  if (response.pageInfo || response.meta) {
    console.log(`[${label}] pageInfo=${JSON.stringify(response.pageInfo ?? null)}`);
    console.log(`[${label}] meta=${JSON.stringify(response.meta ?? null)}`);
    return;
  }

  console.log(`[${label}] data=${JSON.stringify(response.data ?? null)}`);
}

function summarizeObject(value: unknown) {
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const preferredKeys = [
    "uid",
    "id",
    "slug",
    "name",
    "title",
    "source",
    "sourceId",
    "status",
    "statusGroup",
    "protocol",
    "spaceSlug",
    "organizationSlug",
    "publishedAt",
    "sourceCreatedAt",
    "syncedAt",
  ];
  const summary: Record<string, unknown> = {};

  for (const key of preferredKeys) {
    if (key in record) summary[key] = record[key];
  }

  return Object.keys(summary).length > 0 ? summary : record;
}
