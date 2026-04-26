import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { and, count, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import {
  proposalTranslations,
  snapshotProposals,
  snapshotSpaces,
} from "../db/drizzle-schema";

const args = new Set(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const deepseekBaseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const deepseekModel = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const defaultLimit = Number(process.env.TRANSLATE_PROPOSALS_LIMIT || "10");
const proposalBatchSize = Number(process.env.TRANSLATE_PROPOSALS_BATCH_SIZE || "100");
const requestedProposalId = readArgValue("--proposal-id");
const requestedLocales = readArgValues("--locale");
const limit = Number(readArgValue("--limit") || defaultLimit);
const overwrite = args.has("--overwrite");

const localeConfigs: Record<string, { label: string; instruction: string }> = {
  zh: {
    label: "Simplified Chinese",
    instruction: "Translate into natural, professional Simplified Chinese for a governance research product.",
  },
  ja: {
    label: "Japanese",
    instruction: "Translate into natural, professional Japanese for a governance research product.",
  },
  ko: {
    label: "Korean",
    instruction: "Translate into natural, professional Korean for a governance research product.",
  },
};

if (!databaseUrl) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
}

if (!deepseekApiKey) {
  throw new Error("DEEPSEEK_API_KEY is required.");
}

const sql = neon(databaseUrl);
const db = drizzle(sql, {
  schema: {
    snapshotProposals,
    snapshotSpaces,
    proposalTranslations,
  },
});

async function main() {
  const locales = requestedLocales.length > 0 ? requestedLocales : ["zh", "ja", "ko"];
  validateLocales(locales);
  const proposalsCount = await countSourceProposals(requestedProposalId ?? undefined);
  if (proposalsCount === 0) {
    console.log("No proposals found for translation.");
    return;
  }

  const proposalsToProcess = requestedProposalId ? 1 : Math.min(limit, proposalsCount);
  const totalLocaleTargets = proposalsToProcess * locales.length;
  let skippedExistingCount = 0;
  let skippedLowValueCount = 0;
  let failedCount = 0;
  let processedLocaleTargets = 0;
  let translatedCount = 0;

  console.log(
    `[translate] scope proposals=${proposalsToProcess}, target locales=${locales.join(",")}, potential rows=${totalLocaleTargets}, overwrite=${overwrite}, batchSize=${proposalBatchSize}`
  );

  let offset = 0;
  while (offset < proposalsToProcess) {
    const batchLimit = Math.min(proposalBatchSize, proposalsToProcess - offset);
    const proposals = await getSourceProposals(batchLimit, requestedProposalId ?? undefined, offset);
    if (proposals.length === 0) {
      break;
    }

    for (const item of proposals) {
      const existing = await db
        .select({
          locale: proposalTranslations.locale,
        })
        .from(proposalTranslations)
        .where(
          and(
            eq(proposalTranslations.proposalId, item.proposal.id),
            inArray(proposalTranslations.locale, locales)
          )
        );

      const existingLocales = new Set(existing.map((entry) => entry.locale));
      const targetLocales = overwrite ? locales : locales.filter((locale) => !existingLocales.has(locale));
      const skippedForProposal = overwrite ? 0 : locales.length - targetLocales.length;
      skippedExistingCount += skippedForProposal;
      processedLocaleTargets += skippedForProposal;

      if (targetLocales.length === 0) {
        printProgress(
          processedLocaleTargets,
          totalLocaleTargets,
          translatedCount,
          skippedExistingCount,
          skippedLowValueCount,
          failedCount
        );
        continue;
      }

      const skipReason = getLowValueSkipReason(item.proposal.title ?? "", item.proposal.body ?? "");
      if (skipReason) {
        skippedLowValueCount += targetLocales.length;
        processedLocaleTargets += targetLocales.length;
        console.log(`[translate] skipped ${item.proposal.id}: ${skipReason}`);
        printProgress(
          processedLocaleTargets,
          totalLocaleTargets,
          translatedCount,
          skippedExistingCount,
          skippedLowValueCount,
          failedCount
        );
        continue;
      }

      for (const locale of targetLocales) {
        try {
          const translated = await translateProposal({
            locale,
            spaceName: item.space.name,
            title: item.proposal.title,
            body: item.proposal.body ?? "",
            summary: excerpt(item.proposal.body ?? "", 220),
          });

          await db
            .insert(proposalTranslations)
            .values({
              proposalId: item.proposal.id,
              locale,
              title: translated.title,
              body: translated.body,
              summary: translated.summary,
              translatedBy: deepseekModel,
            })
            .onConflictDoUpdate({
              target: [proposalTranslations.proposalId, proposalTranslations.locale],
              set: {
                title: translated.title,
                body: translated.body,
                summary: translated.summary,
                translatedBy: deepseekModel,
                updatedAt: new Date(),
              },
            });

          translatedCount += 1;
          console.log(`[translate] ${item.proposal.id} -> ${locale}`);
        } catch (error) {
          failedCount += 1;
          console.error(
            `[translate] failed ${item.proposal.id} -> ${locale}:`,
            error instanceof Error ? error.message : String(error)
          );
        } finally {
          processedLocaleTargets += 1;
          printProgress(
            processedLocaleTargets,
            totalLocaleTargets,
            translatedCount,
            skippedExistingCount,
            skippedLowValueCount,
            failedCount
          );
        }
      }
    }
    offset += proposals.length;
  }

  console.log(
    `Translation completed. translated=${translatedCount}, skipped(existing)=${skippedExistingCount}, skipped(low-value)=${skippedLowValueCount}, failed=${failedCount}, totalTargets=${totalLocaleTargets}.`
  );
}

async function getSourceProposals(limit: number, proposalId?: string, offset = 0) {
  const query = db
    .select({
      proposal: {
        id: snapshotProposals.id,
        title: snapshotProposals.title,
        body: snapshotProposals.body,
      },
      space: {
        name: snapshotSpaces.name,
      },
    })
    .from(snapshotProposals)
    .innerJoin(snapshotSpaces, eq(snapshotProposals.spaceId, snapshotSpaces.id));

  if (proposalId) {
    return query.where(eq(snapshotProposals.id, proposalId)).limit(1);
  }

  return query.orderBy(snapshotProposals.createdAt).limit(limit).offset(offset);
}

async function countSourceProposals(proposalId?: string) {
  if (proposalId) {
    const [row] = await db
      .select({ count: count() })
      .from(snapshotProposals)
      .where(eq(snapshotProposals.id, proposalId));
    return Number(row?.count ?? 0);
  }

  const [row] = await db
    .select({ count: count() })
    .from(snapshotProposals);

  return Number(row?.count ?? 0);
}

async function translateProposal(input: {
  locale: string;
  spaceName: string;
  title: string;
  body: string;
  summary: string;
}) {
  const localeConfig = localeConfigs[input.locale];
  const protectedBody = protectMarkdownCodeFences(input.body);

  const response = await fetch(`${deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deepseekApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: deepseekModel,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are a professional translator for Web3 governance content.",
            "The source text is a DAO / protocol governance proposal from Snapshot.",
            "Return strict JSON only with keys: title, body, summary.",
            "Preserve markdown structure exactly, especially fenced code blocks, headings, lists, links, tables, and blockquotes.",
            "Never remove, alter, reorder, or translate placeholders in the format [[CODE_BLOCK_n]]. Keep each placeholder exactly as-is.",
            "Your translation must preserve factual meaning, voting intent, governance semantics, numbers, dates, token symbols, addresses, proposal states, and links.",
            "Do not omit or soften risk language, treasury terms, parameter values, or execution details.",
            "Keep protocol names, product names, chain names, token tickers, contract terminology, and governance platform terms accurate.",
            "When a technical or governance term is standard in Web3, prefer the standard translation used by crypto users rather than a generic business translation.",
            "Preserve list structure and option labels when possible.",
            "Do not add commentary, explanation, or extra fields.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            localeConfig.instruction,
            `Target locale: ${localeConfig.label} (${input.locale})`,
            `Protocol / governance space: ${input.spaceName}`,
            "Context: This is a Web3 governance proposal. Translate it for readers who follow DAO governance, protocol upgrades, treasury management, risk parameter changes, delegate voting, and on-chain ecosystem operations.",
            "Translation rules:",
            "- Preserve token symbols exactly, such as ETH, ARB, AAVE, ENS, USDC.",
            "- Preserve proposal IDs, addresses, URLs, numbers, percentages, timestamps, and block references exactly.",
            "- Preserve or accurately translate governance terms such as delegate, quorum, proposal, execution, treasury, vote, snapshot, parameter, emission, slashing, liquidation, bridge, rollup, staking, and safety module.",
            "- Keep markdown syntax intact. Do not remove markdown markers.",
            "- Keep placeholders like [[CODE_BLOCK_0]] untouched.",
            "- Do not rewrite the meaning to sound like marketing copy.",
            "- Keep the tone serious, clear, and product-grade.",
            "- If the source contains a proper noun with no standard localized form, keep the original term.",
            `Title:\n${input.title}`,
            `Summary:\n${input.summary}`,
            `Body:\n${protectedBody.text}`,
          ].join("\n\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API request failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = json.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("DeepSeek returned an empty translation response.");
  }

  let parsed: { title?: string; body?: string; summary?: string };
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    throw new Error(`DeepSeek returned invalid JSON for locale ${input.locale}: ${content.slice(0, 200)}`);
  }

  return {
    title: sanitizeText(parsed.title ?? input.title),
    body: restoreProtectedMarkdown(
      sanitizeText(parsed.body ?? protectedBody.text),
      protectedBody,
      input.body
    ),
    summary: sanitizeText(parsed.summary ?? input.summary),
  };
}

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

function sanitizeText(value: string) {
  return value.replace(/\u0000/g, "").trim();
}

type ProtectedMarkdown = {
  text: string;
  placeholders: string[];
  blocks: string[];
};

function protectMarkdownCodeFences(input: string): ProtectedMarkdown {
  if (!input) {
    return { text: "", placeholders: [], blocks: [] };
  }

  const placeholders: string[] = [];
  const blocks: string[] = [];
  let index = 0;
  const text = input.replace(/```[\s\S]*?```/g, (match) => {
    const placeholder = `[[CODE_BLOCK_${index}]]`;
    placeholders.push(placeholder);
    blocks.push(match);
    index += 1;
    return placeholder;
  });

  return { text, placeholders, blocks };
}

function restoreProtectedMarkdown(
  translated: string,
  protectedMarkdown: ProtectedMarkdown,
  fallbackBody: string
) {
  let restored = translated;

  for (let index = 0; index < protectedMarkdown.placeholders.length; index += 1) {
    const placeholder = protectedMarkdown.placeholders[index];
    const block = protectedMarkdown.blocks[index];
    restored = restored.replaceAll(placeholder, block);
  }

  const missingPlaceholder = protectedMarkdown.placeholders.some((placeholder) => restored.includes(placeholder));
  if (missingPlaceholder) {
    console.warn(
      "[translate] placeholder restoration incomplete; falling back to source body to prevent markdown corruption."
    );
    return fallbackBody;
  }

  return restored;
}

function excerpt(text: string, length: number) {
  if (!text) return "";
  return text.length <= length ? text : `${text.slice(0, length - 3).trimEnd()}...`;
}

function getLowValueSkipReason(title: string, body: string) {
  const normalizedTitle = normalizeForQualityCheck(title);
  const normalizedBody = normalizeForQualityCheck(body);
  const combined = `${normalizedTitle}\n${normalizedBody}`.trim();

  if (!combined) {
    return "empty title/body";
  }

  if (normalizedBody.length < 80 && normalizedTitle.length < 12) {
    return "content too short";
  }

  const lowValuePatterns = [
    /\btest\b/i,
    /\blorem ipsum\b/i,
    /\bdummy\b/i,
    /\bhello world\b/i,
    /(^|\s)asdf($|\s)/i,
    /(^|\s)qwer($|\s)/i,
  ];

  for (const pattern of lowValuePatterns) {
    if (pattern.test(combined)) {
      return `low-value pattern matched (${pattern.source})`;
    }
  }

  return null;
}

function normalizeForQualityCheck(input: string) {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  const remaining = Math.max(0, total - processed);
  console.log(
    `[translate] progress ${processed}/${total} (${percent}%) | translated=${translated} skipped(existing)=${skipped} skipped(low-value)=${skippedLowValue} failed=${failed} remaining=${remaining}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
