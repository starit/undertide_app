import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { and, count, eq, inArray, sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { snapshotSpaces, spaceTranslations } from "../db/drizzle-schema";

const args = new Set(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const deepseekBaseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const deepseekModel = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const defaultLimit = Number(process.env.TRANSLATE_SPACES_LIMIT || "200");
const requestedSpaceId = readArgValue("--space-id");
const requestedLocales = readArgValues("--locale");
const limit = Number(readArgValue("--limit") || defaultLimit);
const overwrite = args.has("--overwrite");

const LOW_VALUE_MIN_ABOUT_LENGTH = 5;

const localeConfigs: Record<string, { label: string; instruction: string }> = {
  zh: {
    label: "Simplified Chinese",
    instruction:
      "Translate into natural, professional Simplified Chinese for a governance research product.",
  },
  ja: {
    label: "Japanese",
    instruction:
      "Translate into natural, professional Japanese for a governance research product.",
  },
  ko: {
    label: "Korean",
    instruction:
      "Translate into natural, professional Korean for a governance research product.",
  },
};

if (!databaseUrl) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
}

if (!deepseekApiKey) {
  throw new Error("DEEPSEEK_API_KEY is required.");
}

const sql = neon(databaseUrl);
const db = drizzle(sql, { schema: { snapshotSpaces, spaceTranslations } });

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const locales = requestedLocales.length > 0 ? requestedLocales : ["zh", "ja", "ko"];
  validateLocales(locales);

  const startedAt = Date.now();

  const spacesCount = await countSourceSpaces(locales, requestedSpaceId ?? undefined);

  if (spacesCount === 0) {
    console.log("[translate:spaces] nothing to translate — all spaces already covered.");
    return;
  }

  const spacesToProcess = requestedSpaceId ? 1 : Math.min(limit, spacesCount);
  const totalLocaleTargets = spacesToProcess * locales.length;
  let skippedExistingCount = 0;
  let skippedLowValueCount = 0;
  let failedCount = 0;
  let processedLocaleTargets = 0;
  let translatedCount = 0;

  console.log(
    `[translate:spaces] start — spaces=${spacesToProcess}/${spacesCount} pending, locales=[${locales.join(",")}], overwrite=${overwrite}`
  );

  const spaces = await getSourceSpaces(spacesToProcess, locales, requestedSpaceId ?? undefined);

  for (const space of spaces) {
    const label = `${space.name} (${space.id})`;

    const existing = await db
      .select({ locale: spaceTranslations.locale })
      .from(spaceTranslations)
      .where(
        and(
          eq(spaceTranslations.spaceId, space.id),
          inArray(spaceTranslations.locale, locales)
        )
      );

    const existingLocales = new Set(existing.map((entry) => entry.locale));
    const targetLocales = overwrite ? locales : locales.filter((locale) => !existingLocales.has(locale));
    const skippedForSpace = overwrite ? 0 : locales.length - targetLocales.length;
    skippedExistingCount += skippedForSpace;
    processedLocaleTargets += skippedForSpace;

    if (targetLocales.length === 0) {
      continue;
    }

    const skipReason = getLowValueSkipReason(space.about ?? "");
    if (skipReason) {
      skippedLowValueCount += targetLocales.length;
      processedLocaleTargets += targetLocales.length;
      console.log(`[translate:spaces] skip  ${label} — ${skipReason}`);
      await db
        .insert(spaceTranslations)
        .values(
          targetLocales.map((locale) => ({
            spaceId: space.id,
            locale,
            about: null,
            translatedBy: "skipped:low-value",
          }))
        )
        .onConflictDoNothing();
      printProgress(processedLocaleTargets, totalLocaleTargets, translatedCount, skippedExistingCount, skippedLowValueCount, failedCount);
      continue;
    }

    for (const locale of targetLocales) {
      const t0 = Date.now();
      try {
        const translated = await translateSpaceAbout({
          label,
          locale,
          spaceName: space.name,
          about: space.about ?? "",
        });

        await withRetry(`upsert translation ${space.id}/${locale}`, () =>
          db
            .insert(spaceTranslations)
            .values({
              spaceId: space.id,
              locale,
              about: translated.about,
              translatedBy: deepseekModel,
            })
            .onConflictDoUpdate({
              target: [spaceTranslations.spaceId, spaceTranslations.locale],
              set: {
                about: translated.about,
                translatedBy: deepseekModel,
                updatedAt: new Date(),
              },
            })
        );

        translatedCount += 1;
        console.log(`[translate:spaces] ok    ${label} → ${locale} (${Date.now() - t0}ms)`);
      } catch (error) {
        failedCount += 1;
        let errorMsg = error instanceof Error ? error.message : String(error);
        if (error && typeof error === "object") {
          const e = error as Record<string, unknown>;
          if (e.code) errorMsg += ` [pg_code=${e.code}]`;
          if (e.detail) errorMsg += ` [detail=${e.detail}]`;
          if (e.constraint) errorMsg += ` [constraint=${e.constraint}]`;
        }
        console.error(`[translate:spaces] fail  ${label} → ${locale}: ${errorMsg}`);
      } finally {
        processedLocaleTargets += 1;
        printProgress(processedLocaleTargets, totalLocaleTargets, translatedCount, skippedExistingCount, skippedLowValueCount, failedCount);
      }
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[translate:spaces] done — translated=${translatedCount} skipped(existing)=${skippedExistingCount} skipped(low-value)=${skippedLowValueCount} failed=${failedCount} elapsed=${elapsed}s`
  );
}

// ─── Source query ─────────────────────────────────────────────────────────────

async function getSourceSpaces(batchLimit: number, locales: string[], spaceId?: string) {
  const baseQuery = db
    .select({
      id: snapshotSpaces.id,
      name: snapshotSpaces.name,
      about: snapshotSpaces.about,
    })
    .from(snapshotSpaces);

  if (spaceId) {
    return baseQuery.where(eq(snapshotSpaces.id, spaceId)).limit(1);
  }

  const aboutFilter = drizzleSql`
    ${snapshotSpaces.about} IS NOT NULL
    AND LENGTH(TRIM(${snapshotSpaces.about})) > ${LOW_VALUE_MIN_ABOUT_LENGTH}
  `;

  if (!overwrite && locales.length > 0) {
    const localeParams = drizzleSql.join(locales.map((l) => drizzleSql`${l}`), drizzleSql.raw(", "));
    return baseQuery
      .where(
        drizzleSql`${aboutFilter}
        AND (
          SELECT COUNT(DISTINCT st.locale)::int
          FROM space_translations st
          WHERE st.space_id = ${snapshotSpaces.id}
            AND st.locale IN (${localeParams})
        ) < ${locales.length}`
      )
      .orderBy(drizzleSql`${snapshotSpaces.followersCount} DESC`)
      .limit(batchLimit);
  }

  return baseQuery
    .where(aboutFilter)
    .orderBy(drizzleSql`${snapshotSpaces.followersCount} DESC`)
    .limit(batchLimit);
}

async function countSourceSpaces(locales: string[], spaceId?: string) {
  if (spaceId) {
    const [row] = await db
      .select({ count: count() })
      .from(snapshotSpaces)
      .where(eq(snapshotSpaces.id, spaceId));
    return Number(row?.count ?? 0);
  }

  const aboutFilter = drizzleSql`
    ${snapshotSpaces.about} IS NOT NULL
    AND LENGTH(TRIM(${snapshotSpaces.about})) > ${LOW_VALUE_MIN_ABOUT_LENGTH}
  `;

  if (!overwrite && locales.length > 0) {
    const localeParams = drizzleSql.join(locales.map((l) => drizzleSql`${l}`), drizzleSql.raw(", "));
    const [row] = await db
      .select({ count: count() })
      .from(snapshotSpaces)
      .where(
        drizzleSql`${aboutFilter}
        AND (
          SELECT COUNT(DISTINCT st.locale)::int
          FROM space_translations st
          WHERE st.space_id = ${snapshotSpaces.id}
            AND st.locale IN (${localeParams})
        ) < ${locales.length}`
      );
    return Number(row?.count ?? 0);
  }

  const [row] = await db
    .select({ count: count() })
    .from(snapshotSpaces)
    .where(aboutFilter);
  return Number(row?.count ?? 0);
}

// ─── Translation ──────────────────────────────────────────────────────────────

async function translateSpaceAbout(input: {
  label: string;
  locale: string;
  spaceName: string;
  about: string;
}): Promise<{ about: string }> {
  const lc = localeConfigs[input.locale];

  console.log(`[translate:spaces] req   ${input.label} → ${input.locale}`);

  const response = await deepseekFetch(`${deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deepseekApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: deepseekModel,
      temperature: 0,
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return STRICT JSON with key: about. Translate the governance space description. Preserve any token symbols, URLs, and proper nouns. Do not translate the space name.",
        },
        {
          role: "user",
          content:
            `${lc.instruction}\n` +
            `Target locale: ${lc.label} (${input.locale})\n` +
            `Space name (do not translate): ${input.spaceName}\n\n` +
            `Description to translate:\n${input.about}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  };
  const choice = payload.choices?.[0];
  const content = choice?.message?.content;
  if (!content) throw new Error("DeepSeek returned an empty translation response.");

  console.log(`[translate:spaces] res   ${input.label} → ${input.locale} finish_reason=${choice?.finish_reason ?? "?"}`);

  const parsed = parseJsonFromAssistant(content, input.locale, choice?.finish_reason, "single-shot") as {
    about?: string;
  };

  return {
    about: sanitizeText(parsed.about ?? input.about),
  };
}

// ─── Low-value skip ───────────────────────────────────────────────────────────

function getLowValueSkipReason(about: string): string | null {
  const trimmed = about.trim();

  if (!trimmed) {
    return "empty about";
  }

  if (trimmed.length <= LOW_VALUE_MIN_ABOUT_LENGTH) {
    return "about too short";
  }

  const lowValuePatterns = [/\btest\b/i, /\blorem ipsum\b/i];

  for (const pattern of lowValuePatterns) {
    if (pattern.test(trimmed)) {
      return `low-value pattern matched (${pattern.source})`;
    }
  }

  return null;
}

// ─── JSON parsing ─────────────────────────────────────────────────────────────

class AssistantJsonParseError extends Error {
  content: string;
  finishReason?: string;
  hint: string;
  locale: string;

  constructor(args: {
    content: string;
    locale: string;
    finishReason?: string;
    hint: string;
    message: string;
  }) {
    super(args.message);
    this.name = "AssistantJsonParseError";
    this.content = args.content;
    this.finishReason = args.finishReason;
    this.hint = args.hint;
    this.locale = args.locale;
  }
}

function repairQuotedJsonAssist(value: string) {
  return value.replace(/“|”/g, '"').replace(/‘|’/g, "'");
}

function parseJsonFromAssistant(
  content: string,
  locale: string,
  finishReason: string | undefined,
  hint: string
): unknown {
  if (finishReason === "length") {
    throw new AssistantJsonParseError({
      content,
      locale,
      finishReason,
      hint,
      message: `DeepSeek truncated (${hint}), finish_reason=length — raise max_tokens.`,
    });
  }

  try {
    return JSON.parse(repairQuotedJsonAssist(content));
  } catch {
    const repaired = repairQuotedJsonAssist(content);
    // Try to extract "about" field via regex as fallback
    const match = repaired.match(/"about"\s*:\s*"([\s\S]*?)"\s*}/);
    if (match) {
      try {
        return { about: JSON.parse(`"${match[1].replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`) };
      } catch {
        return { about: match[1] };
      }
    }
    throw new AssistantJsonParseError({
      content,
      locale,
      finishReason,
      hint,
      message: `DeepSeek invalid JSON ${hint} (${locale}) finish_reason=${finishReason ?? "?"}\n${repaired.slice(0, 620)}`,
    });
  }
}

// ─── CLI helpers ──────────────────────────────────────────────────────────────

function readArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function readArgValues(flag: string) {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  }
  return values;
}

function validateLocales(locales: string[]) {
  for (const locale of locales) {
    if (!localeConfigs[locale]) {
      throw new Error(`Unsupported locale "${locale}". Supported locales: zh, ja, ko.`);
    }
  }
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

function sanitizeText(value: string) {
  return value.replace(/ /g, "").trim();
}

// ─── DeepSeek fetch with retry ────────────────────────────────────────────────

const DEEPSEEK_TIMEOUT_MS = 60_000; // 60s; spaces are tiny so this is generous

async function deepseekFetch(url: string, init: RequestInit): Promise<Response> {
  const retryLimit = 3;
  const baseMs = 2000;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryLimit; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 0);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : baseMs * 2 ** attempt;
        if (attempt < retryLimit) {
          console.warn(
            `[translate:spaces] DeepSeek ${response.status} attempt ${attempt + 1}/${retryLimit + 1}, retrying in ${Math.round(waitMs / 1000)}s`
          );
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        return response;
      }
      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      const isAbort = error instanceof Error && error.name === "AbortError";
      const msg = error instanceof Error ? error.message : String(error);
      if (attempt < retryLimit) {
        const waitMs = baseMs * 2 ** attempt;
        console.warn(
          `[translate:spaces] DeepSeek fetch ${isAbort ? `timeout (>${DEEPSEEK_TIMEOUT_MS / 1000}s)` : `error: ${msg}`} attempt ${attempt + 1}/${retryLimit + 1}, retrying in ${Math.round(waitMs / 1000)}s`
        );
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ─── DB retry helper ──────────────────────────────────────────────────────────

async function withRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  const retryLimit = 3;
  const baseMs = 1000;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retryLimit; attempt++) {
    try {
      const result = await operation();
      if (attempt > 0) console.log(`[db] recovered ${label} after retry ${attempt}`);
      return result;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const retryable =
        /fetch failed|connection|timeout|temporar|network|econn|etimedout|socket/i.test(msg);
      if (attempt === retryLimit || !retryable) break;
      const waitMs = baseMs * 2 ** attempt;
      console.warn(`[db] ${label} failed (attempt ${attempt + 1}/${retryLimit + 1}): ${msg}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ─── Progress logging ─────────────────────────────────────────────────────────

function printProgress(
  processed: number,
  total: number,
  translated: number,
  skipped: number,
  skippedLowValue: number,
  failed: number
) {
  const safeTotal = total > 0 ? total : 1;
  const percent = ((processed / safeTotal) * 100).toFixed(1);
  console.log(
    `[translate:spaces] progress ${processed}/${total} (${percent}%) | translated=${translated} skipped(existing)=${skipped} skipped(low-value)=${skippedLowValue} failed=${failed}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
