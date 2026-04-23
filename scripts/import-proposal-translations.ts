import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { proposalTranslations, snapshotProposals } from "../db/drizzle-schema";

const targetDatabaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const sourceDatabaseUrl = process.env.SOURCE_DATABASE_URL;
const defaultBatchSize = Number(process.env.IMPORT_PROPOSAL_TRANSLATIONS_BATCH_SIZE || "500");
const locale = normalizeLocale(readArgValue("--locale") || process.env.IMPORT_PROPOSAL_TRANSLATIONS_LOCALE || "zh");
const proposalId = readArgValue("--proposal-id");
const batchSize = Number(readArgValue("--batch-size") || defaultBatchSize);
const dryRun = process.argv.includes("--dry-run");

if (!targetDatabaseUrl) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
}

if (!sourceDatabaseUrl) {
  throw new Error("SOURCE_DATABASE_URL is required.");
}

if (!Number.isInteger(batchSize) || batchSize <= 0) {
  throw new Error("Batch size must be a positive integer.");
}

const targetNeon = neon(targetDatabaseUrl);
const sourceNeon = neon(sourceDatabaseUrl);
const db = drizzle(targetNeon, {
  schema: {
    proposalTranslations,
    snapshotProposals,
  },
});

type SourceRow = {
  id: string;
  target_lang: string | null;
  translated_title: string | null;
  translated_body: string | null;
  short_summary: string | null;
};

async function main() {
  let offset = 0;
  let imported = 0;
  let skippedMissingFields = 0;
  let skippedMissingProposal = 0;
  let totalRead = 0;

  console.log(
    `[import-translations] start locale=${locale} batchSize=${batchSize}${proposalId ? ` proposalId=${proposalId}` : ""}${dryRun ? " dryRun=true" : ""}`
  );

  while (true) {
    const sourceRows = await fetchSourceRows({
      batchSize,
      offset,
      proposalId: proposalId ?? undefined,
    });

    if (sourceRows.length === 0) {
      break;
    }

    totalRead += sourceRows.length;
    offset += sourceRows.length;

    const completeRows: SourceRow[] = [];
    for (const row of sourceRows) {
      if (!hasCompleteTranslation(row)) {
        skippedMissingFields += 1;
        continue;
      }
      completeRows.push(row);
    }

    if (completeRows.length === 0) {
      console.log(
        `[import-translations] scanned ${totalRead} rows, imported ${imported}, skipped missing fields ${skippedMissingFields}, skipped missing proposals ${skippedMissingProposal}`
      );
      if (proposalId) break;
      continue;
    }

    const existingProposals = await db
      .select({ id: snapshotProposals.id })
      .from(snapshotProposals)
      .where(inArray(snapshotProposals.id, completeRows.map((row) => row.id)));

    const existingProposalIds = new Set(existingProposals.map((row) => row.id));
    const importableRows = completeRows.filter((row) => existingProposalIds.has(row.id));
    skippedMissingProposal += completeRows.length - importableRows.length;

    if (!dryRun && importableRows.length > 0) {
      await db
        .insert(proposalTranslations)
        .values(
          importableRows.map((row) => ({
            proposalId: row.id,
            locale,
            title: sanitizeText(row.translated_title),
            body: sanitizeText(row.translated_body),
            summary: sanitizeText(row.short_summary),
            translatedBy: "deepseek",
          }))
        )
        .onConflictDoUpdate({
          target: [proposalTranslations.proposalId, proposalTranslations.locale],
          set: {
            title: sql`excluded.title`,
            body: sql`excluded.body`,
            summary: sql`excluded.summary`,
            translatedBy: "deepseek",
            updatedAt: new Date(),
          },
        });
    }

    imported += importableRows.length;

    console.log(
      `[import-translations] scanned ${totalRead} rows, imported ${imported}, skipped missing fields ${skippedMissingFields}, skipped missing proposals ${skippedMissingProposal}`
    );

    if (proposalId) break;
  }

  console.log(
    `[import-translations] completed. read=${totalRead} imported=${imported} skippedMissingFields=${skippedMissingFields} skippedMissingProposal=${skippedMissingProposal}${dryRun ? " dryRun=true" : ""}`
  );
}

async function fetchSourceRows(input: {
  batchSize: number;
  offset: number;
  proposalId?: string;
}): Promise<SourceRow[]> {
  const rows = (input.proposalId
    ? await sourceNeon`
        select
          id,
          target_lang,
          translated_title,
          translated_body,
          short_summary
        from public.proposals
        where (
          target_lang is null
          or lower(target_lang) in ('zh', 'zh-cn', 'zh_hans', 'zh-hans', 'zh-hans-cn')
        )
          and id = ${input.proposalId}
        order by updated_at asc nulls last, created_at asc nulls last, id asc
        limit ${input.batchSize}
        offset ${input.offset}
      `
    : await sourceNeon`
        select
          id,
          target_lang,
          translated_title,
          translated_body,
          short_summary
        from public.proposals
        where (
          target_lang is null
          or lower(target_lang) in ('zh', 'zh-cn', 'zh_hans', 'zh-hans', 'zh-hans-cn')
        )
        order by updated_at asc nulls last, created_at asc nulls last, id asc
        limit ${input.batchSize}
        offset ${input.offset}
      `) as SourceRow[];

  for (const row of rows) {
    if (row.target_lang) {
      row.target_lang = normalizeLocale(row.target_lang);
    }
  }

  return rows;
}

function hasCompleteTranslation(row: SourceRow) {
  return Boolean(
    sanitizeText(row.translated_title) &&
      sanitizeText(row.translated_body) &&
      sanitizeText(row.short_summary)
  );
}

function normalizeLocale(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "zh-cn" || normalized === "zh_hans" || normalized === "zh-hans") {
    return "zh";
  }
  return normalized;
}

function sanitizeText(value: string | null) {
  return value?.replace(/\u0000/g, "").trim() || "";
}

function readArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
