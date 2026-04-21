import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import {
  proposalEnrichments,
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
    proposalEnrichments,
    proposalTranslations,
  },
});

async function main() {
  const locales = requestedLocales.length > 0 ? requestedLocales : ["zh", "ja", "ko"];
  validateLocales(locales);

  const proposals = await getSourceProposals(limit, requestedProposalId ?? undefined);
  if (proposals.length === 0) {
    console.log("No proposals found for translation.");
    return;
  }

  let translatedCount = 0;

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

    if (targetLocales.length === 0) {
      continue;
    }

    for (const locale of targetLocales) {
      const translated = await translateProposal({
        locale,
        spaceName: item.space.name,
        title: item.proposal.title,
        body: item.enrichment?.readableContent ?? item.proposal.body ?? "",
        summary: item.enrichment?.aiSummary ?? excerpt(item.proposal.body ?? "", 220),
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
    }
  }

  console.log(`Translation completed. Upserted ${translatedCount} rows.`);
}

async function getSourceProposals(limit: number, proposalId?: string) {
  const query = db
    .select({
      proposal: snapshotProposals,
      enrichment: proposalEnrichments,
      space: snapshotSpaces,
    })
    .from(snapshotProposals)
    .innerJoin(snapshotSpaces, eq(snapshotProposals.spaceId, snapshotSpaces.id))
    .leftJoin(proposalEnrichments, eq(proposalEnrichments.proposalId, snapshotProposals.id));

  if (proposalId) {
    return query.where(eq(snapshotProposals.id, proposalId)).limit(1);
  }

  return query.orderBy(snapshotProposals.createdAt).limit(limit);
}

async function translateProposal(input: {
  locale: string;
  spaceName: string;
  title: string;
  body: string;
  summary: string;
}) {
  const localeConfig = localeConfigs[input.locale];

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
            "- Do not rewrite the meaning to sound like marketing copy.",
            "- Keep the tone serious, clear, and product-grade.",
            "- If the source contains a proper noun with no standard localized form, keep the original term.",
            `Title:\n${input.title}`,
            `Summary:\n${input.summary}`,
            `Body:\n${input.body}`,
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

  const parsed = JSON.parse(content) as {
    title?: string;
    body?: string;
    summary?: string;
  };

  return {
    title: sanitizeText(parsed.title ?? input.title),
    body: sanitizeText(parsed.body ?? input.body),
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

function excerpt(text: string, length: number) {
  if (!text) return "";
  return text.length <= length ? text : `${text.slice(0, length - 3).trimEnd()}...`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
