import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { and, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { proposalTranslations, snapshotProposals } from "../db/drizzle-schema";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

const args = process.argv.slice(2);

/**
 * Stored-body artifacts from (a) legacy in-body truncation markers / model paraphrases,
 * (b) post-fix locale footers from `finalizeTranslatedBody` in `translate-proposals.ts`.
 * When adding footers or strip patterns there, extend this list so the scanner stays useful.
 */
const TRUNCATION_BODY_ILIKE_PATTERNS = [
  "%content truncated for translation%",
  "%内容因截断而省略%",
  "%以下译文仅基于原文前%",
  "%其余部分未参与翻译%",
  "%This translation covers only the first%",
  "%remainder was not sent for translation%",
  "%原文の先頭%",
  "%それ以降は含まれません%",
  "%원문의 앞%",
  "%이후 내용은 포함되지 않습니다%",
] as const;

function readArgValue(flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function readArgValues(flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1]) {
      values.push(args[index + 1]);
    }
  }
  return values;
}

function printHelp() {
  console.log(`Usage: npx tsx scripts/list-retranslate-candidates.ts [options]

Read-only: lists proposal_translations rows whose body likely reflects a truncated source
(legacy markers, model-translated markers, or post-fix truncation footers).

Options:
  --locale <code>   Repeat to restrict (e.g. --locale zh --locale ja). Default: all locales in DB.
  --limit <n>       Max rows (default 5000, max 100000).
  --format table|json|csv|commands|pairs
                    table (default), json, csv, shell-ready translate commands, or proposal_id<TAB>locale

Re-translate one row and upsert DB:
  npx tsx scripts/translate-proposals.ts --proposal-id <id> --locale <zh|ja|ko> --overwrite
`);
}

async function main() {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
  }

  const localeFilter = readArgValues("--locale");
  const limitRaw = Number(readArgValue("--limit") || "5000");
  const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 5000), 100_000);
  const format = (readArgValue("--format") || "table").toLowerCase();

  if (!["table", "json", "csv", "commands", "pairs"].includes(format)) {
    throw new Error(`Invalid --format "${format}". Use table, json, csv, commands, or pairs.`);
  }

  for (const loc of localeFilter) {
    if (!/^[a-z]{2}(-[a-z]+)?$/i.test(loc)) {
      throw new Error(`Invalid --locale "${loc}".`);
    }
  }

  const sqlClient = neon(databaseUrl);
  const db = drizzle(sqlClient, {
    schema: {
      proposalTranslations,
      snapshotProposals,
    },
  });

  const bodyMatch = or(
    ...TRUNCATION_BODY_ILIKE_PATTERNS.map((pat) => ilike(proposalTranslations.body, pat))
  );

  const conditions = [isNotNull(proposalTranslations.body), bodyMatch];
  if (localeFilter.length > 0) {
    conditions.push(inArray(proposalTranslations.locale, localeFilter));
  }

  const rows = await db
    .select({
      proposalId: proposalTranslations.proposalId,
      locale: proposalTranslations.locale,
      sourceBodyChars: sql<number>`coalesce(length(${snapshotProposals.body}), 0)::int`,
      translationBodyChars: sql<number>`coalesce(length(${proposalTranslations.body}), 0)::int`,
      translatedBy: proposalTranslations.translatedBy,
      updatedAt: proposalTranslations.updatedAt,
    })
    .from(proposalTranslations)
    .innerJoin(snapshotProposals, eq(proposalTranslations.proposalId, snapshotProposals.id))
    .where(and(...conditions))
    .orderBy(desc(proposalTranslations.updatedAt))
    .limit(limit);

  if (format === "json") {
    console.log(JSON.stringify(rows, null, 2));
    console.error(`[list-retranslate] rows=${rows.length} (limit=${limit})`);
    return;
  }

  if (format === "csv") {
    console.log("proposal_id,locale,source_body_chars,translation_body_chars,translated_by,updated_at");
    for (const r of rows) {
      const line = [
        r.proposalId,
        r.locale,
        r.sourceBodyChars,
        r.translationBodyChars,
        r.translatedBy ?? "",
        r.updatedAt?.toISOString() ?? "",
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",");
      console.log(line);
    }
    console.error(`[list-retranslate] rows=${rows.length} (limit=${limit})`);
    return;
  }

  if (format === "commands") {
    for (const r of rows) {
      console.log(
        `npx tsx scripts/translate-proposals.ts --proposal-id ${r.proposalId} --locale ${r.locale} --overwrite`
      );
    }
    console.error(`[list-retranslate] rows=${rows.length} (limit=${limit})`);
    return;
  }

  if (format === "pairs") {
    for (const r of rows) {
      console.log(`${r.proposalId}\t${r.locale}`);
    }
    console.error(`[list-retranslate] rows=${rows.length} (limit=${limit})`);
    return;
  }

  console.log(
    ["proposal_id", "locale", "src_chars", "tr_chars", "translated_by", "updated_at"].join("\t")
  );
  for (const r of rows) {
    console.log(
      [
        r.proposalId,
        r.locale,
        r.sourceBodyChars,
        r.translationBodyChars,
        r.translatedBy ?? "",
        r.updatedAt?.toISOString() ?? "",
      ].join("\t")
    );
  }
  console.error(`[list-retranslate] rows=${rows.length} (limit=${limit})`);
  console.error(
    `[list-retranslate] Re-run one: npx tsx scripts/translate-proposals.ts --proposal-id <id> --locale <zh|ja|ko> --overwrite`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
