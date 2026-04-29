import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { and, count, eq, inArray, sql as drizzleSql } from "drizzle-orm";
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
const maxResponseTokens = Number(process.env.TRANSLATE_MAX_TOKENS || "8192");
// Bodies longer than this are truncated before sending to the LLM to keep responses within
// the max_tokens budget. Most proposals are well under 10 000 chars; very long ones
// (e.g. detailed parameter updates with appendices) are summarised via the excerpt field.
const maxBodyCharsForTranslation = Number(process.env.TRANSLATE_MAX_BODY_CHARS || "12000");
// If protected body exceeds this UTF-16 length (same limit as truncation source), translate in
// two completions (meta + body-only) to avoid max_tokens truncation inside one huge JSON blob.
const twoPhaseBodyCharThreshold = Number(process.env.TRANSLATE_TWO_PHASE_BODY_CHARS || "4000");
const maxMetaResponseTokens = Number(process.env.TRANSLATE_MAX_TOKENS_META || "3072");
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
  const proposalsCount = await countSourceProposals(locales, requestedProposalId ?? undefined);
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
    const proposals = await getSourceProposals(batchLimit, locales, requestedProposalId ?? undefined, offset);
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
        // Insert sentinel rows so this proposal is permanently marked and never
        // re-fetched on future runs. Uses onConflictDoNothing to avoid overwriting
        // any real translations that might already exist for some locales.
        if (targetLocales.length > 0) {
          await db
            .insert(proposalTranslations)
            .values(
              targetLocales.map((locale) => ({
                proposalId: item.proposal.id,
                locale,
                title: null,
                body: null,
                summary: null,
                translatedBy: "skipped:low-value",
              }))
            )
            .onConflictDoNothing();
        }
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

async function getSourceProposals(batchLimit: number, locales: string[], proposalId?: string, offset = 0) {
  const baseQuery = db
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
    return baseQuery.where(eq(snapshotProposals.id, proposalId)).limit(1);
  }

  // When not overwriting, push the "needs translation" filter into SQL so we never
  // waste iterations scanning already-translated proposals on restart.
  if (!overwrite && locales.length > 0) {
    const localeList = locales.map((l) => `'${l}'`).join(", ");
    return baseQuery
      .where(
        drizzleSql`(
          SELECT COUNT(DISTINCT pt.locale)::int
          FROM proposal_translations pt
          WHERE pt.proposal_id = ${snapshotProposals.id}
            AND pt.locale IN (${drizzleSql.raw(localeList)})
        ) < ${locales.length}
        AND NOT (
          COALESCE(LENGTH(TRIM(COALESCE(${snapshotProposals.body}, ''))), 0) < 80
          AND LENGTH(TRIM(${snapshotProposals.title})) < 12
        )
        AND (
          TRIM(${snapshotProposals.title}) != ''
          OR COALESCE(TRIM(${snapshotProposals.body}), '') != ''
        )`
      )
      .orderBy(drizzleSql`${snapshotProposals.createdAt} DESC`)
      .limit(batchLimit)
      .offset(offset);
  }

  return baseQuery
    .orderBy(drizzleSql`${snapshotProposals.createdAt} DESC`)
    .limit(batchLimit)
    .offset(offset);
}

async function countSourceProposals(locales: string[], proposalId?: string) {
  if (proposalId) {
    const [row] = await db
      .select({ count: count() })
      .from(snapshotProposals)
      .where(eq(snapshotProposals.id, proposalId));
    return Number(row?.count ?? 0);
  }

  // When not overwriting, count only proposals that still need at least one locale.
  if (!overwrite && locales.length > 0) {
    const localeList = locales.map((l) => `'${l}'`).join(", ");
    const [row] = await db
      .select({ count: count() })
      .from(snapshotProposals)
      .where(
        drizzleSql`(
          SELECT COUNT(DISTINCT pt.locale)::int
          FROM proposal_translations pt
          WHERE pt.proposal_id = ${snapshotProposals.id}
            AND pt.locale IN (${drizzleSql.raw(localeList)})
        ) < ${locales.length}
        AND NOT (
          COALESCE(LENGTH(TRIM(COALESCE(${snapshotProposals.body}, ''))), 0) < 80
          AND LENGTH(TRIM(${snapshotProposals.title})) < 12
        )
        AND (
          TRIM(${snapshotProposals.title}) != ''
          OR COALESCE(TRIM(${snapshotProposals.body}), '') != ''
        )`
      );
    return Number(row?.count ?? 0);

  }

  const [row] = await db.select({ count: count() }).from(snapshotProposals);
  return Number(row?.count ?? 0);
}

function repairQuotedJsonAssist(value: string) {
  return value.replace(/\u201C|\u201D/g, '"').replace(/\u2018|\u2019/g, "'");
}

class AssistantJsonParseError extends Error {
  content: string;
  finishReason?: string;
  hint: string;
  locale: string;

  constructor(args: { content: string; locale: string; finishReason?: string; hint: string; message: string }) {
    super(args.message);
    this.name = "AssistantJsonParseError";
    this.content = args.content;
    this.finishReason = args.finishReason;
    this.hint = args.hint;
    this.locale = args.locale;
  }
}

function parseJsonFromAssistant(content: string, locale: string, finishReason: string | undefined, hint: string): unknown {
  if (finishReason === "length") {
    throw new AssistantJsonParseError({
      content,
      locale,
      finishReason,
      hint,
      message:
        `DeepSeek truncated (${hint}), finish_reason=length — raise TRANSLATE_MAX_TOKENS / TRANSLATE_MAX_TOKENS_META or lower TRANSLATE_MAX_BODY_CHARS.`,
    });
  }
  try {
    return JSON.parse(repairQuotedJsonAssist(content));
  } catch {
    const repaired = repairQuotedJsonAssist(content);
    const extracted =
      hint === "single-shot"
        ? extractSingleShotFields(repaired)
        : hint === "phase1:title+summary"
          ? extractMetaFields(repaired)
          : null;
    if (extracted) {
      return extracted;
    }
    throw new AssistantJsonParseError({
      content,
      locale,
      finishReason,
      hint,
      message:
        `DeepSeek invalid JSON ${hint} (${locale}) finish_reason=${finishReason ?? "?"}\n${repaired.slice(0, 620)}`,
    });
  }
}

/**
 * Short proposals: one completion ({ title, body, summary } JSON).
 * When `truncatedBody` reaches `TRANSLATE_TWO_PHASE_BODY_CHARS`, split into meta + body-only completions.
 */
async function translateProposal(input: {
  locale: string;
  spaceName: string;
  title: string;
  body: string;
  summary: string;
}) {
  const excerptBasis = buildMetaExcerpt(input.body ?? "", input.summary);

  const truncatedBody =
    input.body.length > maxBodyCharsForTranslation
      ? `${input.body.slice(0, maxBodyCharsForTranslation)}\n\n[…content truncated for translation…]`
      : input.body;

  const protectedBody = protectMarkdownCodeFences(truncatedBody);

  const useTwoPhase =
    truncatedBody.length >= twoPhaseBodyCharThreshold && sanitizeText(protectedBody.text).length > 0;

  if (!useTwoPhase) {
    try {
      return await translateProposalSingleShot(input, protectedBody);
    } catch (error) {
      if (
        error instanceof AssistantJsonParseError &&
        sanitizeText(protectedBody.text).length > 0
      ) {
        console.warn(
          `[translate] single-shot parse failed for ${input.locale}; retrying in two-phase mode (${error.hint}, finish_reason=${error.finishReason ?? "?"})`
        );
      } else {
        throw error;
      }
    }
  }

  const meta = await translateTitleAndSummaryRound({
    locale: input.locale,
    spaceName: input.spaceName,
    title: input.title,
    excerpt: excerptBasis || input.title,
  });

  if (!sanitizeText(protectedBody.text)) {
    return {
      title: sanitizeText(meta.title ?? input.title),
      summary: sanitizeText(meta.summary ?? ""),
      body: "",
    };
  }

  const rawBodyTranslated = await translateBodyRound({
    locale: input.locale,
    spaceName: input.spaceName,
    translatedTitle: meta.title ?? input.title,
    protectedBody,
  });

  return {
    title: sanitizeText(meta.title ?? input.title),
    summary: sanitizeText(meta.summary ?? excerptBasis),
    body: restoreProtectedMarkdown(sanitizeText(rawBodyTranslated), protectedBody, input.body),
  };
}

async function translateProposalSingleShot(
  input: {
    locale: string;
    spaceName: string;
    title: string;
    body: string;
    summary: string;
  },
  protectedBody: { text: string; placeholders: string[]; blocks: string[] }
): Promise<{ title: string; body: string; summary: string }> {
  const lc = localeConfigs[input.locale];
  const response = await fetch(`${deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deepseekApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: deepseekModel,
      temperature: 0,
      max_tokens: maxResponseTokens,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            [
              "You translate Web3 DAO governance proposals from Snapshot.",
              "Return STRICT JSON ONLY with keys: title, body, summary.",
              "Preserve markdown; never alter [[CODE_BLOCK_n]] placeholders.",
              "Preserve token symbols, URLs, addresses, numbers. Do not emit keys other than title, body, summary.",
            ].join(" "),
        },
        {
          role: "user",
          content:
            `${lc.instruction}\n` +
            `Target locale: ${lc.label} (${input.locale})\n` +
            `Protocol / governance space: ${input.spaceName}\n\n` +
            `Title:\n${input.title}\n` +
            `Summary (short excerpt for context):\n${input.summary}\n` +
            `Body:\n${protectedBody.text}`,
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

  const parsed = parseJsonFromAssistant(content, input.locale, choice?.finish_reason, "single-shot") as {
    title?: string;
    body?: string;
    summary?: string;
  };

  return {
    title: sanitizeText(parsed.title ?? input.title),
    summary: sanitizeText(parsed.summary ?? input.summary),
    body: restoreProtectedMarkdown(sanitizeText(parsed.body ?? protectedBody.text), protectedBody, input.body),
  };
}

async function translateTitleAndSummaryRound(args: {
  locale: string;
  spaceName: string;
  title: string;
  excerpt: string;
}) {
  const lc = localeConfigs[args.locale];
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(`${deepseekBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deepseekApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: deepseekModel,
        temperature: 0,
        max_tokens: attempt === 1 ? maxMetaResponseTokens : Math.min(maxMetaResponseTokens, 1536),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              [
                'You output ONLY JSON keys "title" and "summary". Never include body or raw proposal markdown repetition.',
                "The excerpt parameter is SHORT plain text only — summarise it faithfully in one compact paragraph.",
                "Keep summary concise: ideally under 140 Chinese characters or equivalent brevity in the target language.",
                "Do not emit bullet lists, staffing rosters, or repeated line-by-line role descriptions unless absolutely essential.",
                'Do NOT restate hierarchical staffing/org charts bullet-for-bullet unless excerpt already does so in miniature.',
                attempt === 2
                  ? "Retry mode: keep summary much shorter, avoid bullet explosion, and finish valid JSON decisively."
                  : "",
              ]
                .filter(Boolean)
                .join(" "),
          },
          {
            role: "user",
            content:
              `${lc.instruction}\n` +
              `Target locale: ${lc.label} (${args.locale})\n` +
              `Protocol / governance space: ${args.spaceName}\n\n` +
              `Title:\n${args.title}\n\n` +
              `Preview excerpt ONLY:\n${args.excerpt}`,
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
    if (!content) throw new Error("DeepSeek returned empty meta (title/summary).");

    try {
      const parsed = parseJsonFromAssistant(content, args.locale, choice?.finish_reason, "phase1:title+summary") as {
        title?: string;
        summary?: string;
      };
      return {
        title: parsed.title ?? args.title,
        summary: parsed.summary ?? args.excerpt,
      };
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
    }
  }

  if (lastError instanceof AssistantJsonParseError) {
    const fallback =
      lastError.finishReason === "length"
        ? null
        : extractPartialMeta(lastError.content, args.title, args.excerpt);
    if (fallback && isRecoveredMetaSafe(fallback, args.title, args.excerpt)) {
      console.warn(
        `[translate] recovered partial meta for ${args.locale} from malformed JSON (${lastError.hint}, finish_reason=${lastError.finishReason ?? "?"})`
      );
      return {
        title: fallback.title || args.title,
        summary: fallback.summary || args.excerpt,
      };
    }
  }

  throw lastError;
}

async function translateBodyRound(args: {
  locale: string;
  spaceName: string;
  translatedTitle: string;
  protectedBody: { text: string; placeholders: string[]; blocks: string[] };
}) {
  const lc = localeConfigs[args.locale];
  const response = await fetch(`${deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deepseekApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: deepseekModel,
      temperature: 0,
      max_tokens: maxResponseTokens,
      messages: [
        {
          role: "system",
          content:
            [
              "Translate Snapshot governance BODY markdown ONLY.",
              "Return ONLY the translated markdown body text. No JSON. No code fences around your answer.",
              'Keep [[CODE_BLOCK_n]] verbatim; never omit them.',
              "Preserve headings, lists, markdown links emphasis — translate prose only.",
            ].join(" "),
        },
        {
          role: "user",
          content:
            `${lc.instruction}\n` +
            `Target locale: ${lc.label} (${args.locale})\n` +
            `Protocol / governance space: ${args.spaceName}\n\n` +
            `Translated title:\n${args.translatedTitle}\n\n` +
            `Body:\n${args.protectedBody.text}`,
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
  if (!content) throw new Error("DeepSeek returned empty body translation.");
  if (choice?.finish_reason === "length") {
    throw new Error(
      `DeepSeek truncated (phase2:body-only), finish_reason=length — raise TRANSLATE_MAX_TOKENS or lower TRANSLATE_MAX_BODY_CHARS.`
    );
  }
  return sanitizeBodyOnlyOutput(content);
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

function buildMetaExcerpt(body: string, fallbackSummary: string) {
  const source = excerpt(body, 260) || fallbackSummary.trim();
  const normalized = normalizeExcerptText(source).slice(0, 320);
  return normalized || fallbackSummary.trim();
}

function normalizeExcerptText(value: string) {
  return value.replace(/[#>*_`~-]/g, " ").replace(/\s+/g, " ").trim();
}

function decodeLooseJsonString(value: string) {
  try {
    return JSON.parse(`"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  } catch {
    return value
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

function extractSingleShotFields(content: string) {
  const match = content.match(
    /"title"\s*:\s*"([\s\S]*?)",\s*"body"\s*:\s*"([\s\S]*?)",\s*"summary"\s*:\s*"([\s\S]*?)"\s*}/
  );

  if (!match) {
    return null;
  }

  return {
    title: sanitizeText(decodeLooseJsonString(match[1])),
    body: sanitizeText(decodeLooseJsonString(match[2])),
    summary: sanitizeText(decodeLooseJsonString(match[3])),
  };
}

function extractMetaFields(content: string) {
  const match = content.match(/"title"\s*:\s*"([\s\S]*?)",\s*"summary"\s*:\s*"([\s\S]*?)"\s*}/);

  if (!match) {
    return null;
  }

  return {
    title: sanitizeText(decodeLooseJsonString(match[1])),
    summary: sanitizeText(decodeLooseJsonString(match[2])),
  };
}

function extractPartialMeta(content: string, fallbackTitle: string, fallbackSummary: string) {
  const repaired = repairQuotedJsonAssist(content);
  const titleMatch = repaired.match(/"title"\s*:\s*"([\s\S]*?)"\s*,/);
  const summaryClosedMatch = repaired.match(/"summary"\s*:\s*"([\s\S]*?)"\s*(?:[,}])/);

  if (!titleMatch || !summaryClosedMatch) {
    return null;
  }

  const title = sanitizeText(decodeLooseJsonString(titleMatch[1]));
  const summary = sanitizeText(decodeLooseJsonString(summaryClosedMatch[1]));

  return { title, summary };
}

function isRecoveredMetaSafe(
  recovered: { title: string; summary: string },
  fallbackTitle: string,
  fallbackSummary: string
) {
  if (!recovered.title || !recovered.summary) return false;
  if (recovered.title.endsWith("\\") || recovered.summary.endsWith("\\")) return false;
  if (recovered.title.length > 240 || recovered.summary.length > 900) return false;
  if (recovered.title === fallbackTitle && recovered.summary === fallbackSummary) return false;
  return true;
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
    const placeholderCount = restored.split(placeholder).length - 1;
    if (placeholderCount !== 1) {
      console.warn(
        `[translate] placeholder validation failed for ${placeholder}: expected 1 occurrence, got ${placeholderCount}; falling back to source body.`
      );
      return fallbackBody;
    }
    restored = restored.split(placeholder).join(block);
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

function sanitizeBodyOnlyOutput(content: string) {
  let value = content.trim();

  const fencedMatch = value.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  if (fencedMatch) {
    value = fencedMatch[1].trim();
  }

  const wrapperPatterns = [
    /^(?:here is the translated markdown body|here is the translated body|translated body):\s*/i,
    /^(?:以下是译文正文|以下是翻译后的正文|以下为翻译后的正文|正文翻译如下)：?\s*/i,
  ];

  for (const pattern of wrapperPatterns) {
    if (pattern.test(value)) {
      value = value.replace(pattern, "").trim();
      break;
    }
  }

  if (!value) {
    throw new Error("DeepSeek body-only phase returned empty content after sanitization.");
  }

  if (/^(?:here is|translated body:|以下是|以下为)/i.test(value)) {
    throw new Error("DeepSeek body-only phase returned assistant wrapper prose instead of raw markdown body.");
  }

  return value;
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
