import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { and, desc, eq, sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import {
  governanceProtocolSources,
  governanceProtocols,
  snapshotSpaces,
  tallyOrganizations,
} from "../db/drizzle-schema";
import { normalizeProtocolCandidate, normalizeProtocolId } from "../lib/governance/normalizers";

const args = new Set(process.argv.slice(2));
const options = {
  dryRun: args.has("--dry-run"),
  source: readStringArg("--source") ?? "all",
  limit: readNumberArg("--limit") ?? 5000,
  minProposals: readNumberArg("--min-proposals") ?? 0,
  seedFile: readStringArg("--seed-file") ?? "data/governance-protocol-sources.json",
  skipSeed: args.has("--skip-seed"),
};

if (!["all", "snapshot", "tally"].includes(options.source)) {
  throw new Error('--source must be one of "all", "snapshot", or "tally".');
}

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
}

const sql = neon(databaseUrl);
const db = drizzle(sql, {
  schema: {
    governanceProtocols,
    governanceProtocolSources,
    snapshotSpaces,
    tallyOrganizations,
  },
});

async function main() {
  console.log(
    `[protocol-link] starting source=${options.source} limit=${options.limit} minProposals=${options.minProposals} dryRun=${options.dryRun}`
  );

  let linked = 0;

  if (!options.skipSeed) {
    linked += await linkManualSeeds();
  }

  if (options.source === "all" || options.source === "snapshot") {
    linked += await linkSnapshotSpaces();
  }

  if (options.source === "all" || options.source === "tally") {
    linked += await linkTallyOrganizations();
  }

  console.log(`[protocol-link] completed linked=${linked}`);
}

async function linkManualSeeds() {
  const seeds = readManualSeeds(options.seedFile);
  if (seeds.length === 0) return 0;

  let linked = 0;

  for (const seed of seeds) {
    const protocolId = resolveSeedProtocolId(seed);
    const protocolName = normalizeDisplayName(readSeedString(seed.protocolName) ?? readSeedString(seed.name) ?? protocolId);
    const sources = readSeedSources(seed);

    for (const source of sources) {
      await upsertProtocolSource({
        protocolId,
        protocolName,
        aliases: readSeedStringArray(seed.aliases),
        categories: readSeedStringArray(seed.categories),
        website: readSeedString(seed.website),
        avatar: readSeedString(seed.avatar),
        source: source.source,
        sourceId: source.sourceId,
        sourceKind: source.sourceKind,
        sourceSlug: source.sourceSlug,
        sourceName: source.sourceName,
        isPrimary: source.isPrimary,
        confidence: source.confidence,
        linkedBy: "manual-seed",
      });
      linked += 1;
    }
  }

  return linked;
}

async function linkSnapshotSpaces() {
  const rows = await db
    .select({
      id: snapshotSpaces.id,
      name: snapshotSpaces.name,
      about: snapshotSpaces.about,
      avatar: snapshotSpaces.avatar,
      categories: snapshotSpaces.categories,
      website: snapshotSpaces.website,
      proposalCount: snapshotSpaces.proposalCount,
    })
    .from(snapshotSpaces)
    .where(drizzleSql`${snapshotSpaces.proposalCount} >= ${options.minProposals}`)
    .orderBy(desc(snapshotSpaces.proposalCount), snapshotSpaces.name)
    .limit(options.limit);

  let linked = 0;

  for (const row of rows) {
    const protocolId = normalizeProtocolCandidate(row.id) || normalizeProtocolId(row.name);
    const protocolName = normalizeDisplayName(row.name || row.id);

    await upsertProtocolSource({
      protocolId,
      protocolName,
      aliases: uniqueStrings([row.id, row.name]),
      categories: Array.isArray(row.categories) ? row.categories : [],
      website: row.website,
      avatar: row.avatar,
      source: "snapshot",
      sourceId: row.id,
      sourceKind: "snapshot-space",
      sourceSlug: row.id,
      sourceName: row.name,
      isPrimary: true,
      confidence: "medium",
    });
    linked += 1;
  }

  return linked;
}

async function linkTallyOrganizations() {
  const rows = await db
    .select({
      id: tallyOrganizations.id,
      slug: tallyOrganizations.slug,
      name: tallyOrganizations.name,
      description: tallyOrganizations.description,
      icon: tallyOrganizations.icon,
      proposalsCount: tallyOrganizations.proposalsCount,
    })
    .from(tallyOrganizations)
    .where(drizzleSql`${tallyOrganizations.proposalsCount} >= ${options.minProposals}`)
    .orderBy(desc(tallyOrganizations.proposalsCount), tallyOrganizations.name)
    .limit(options.limit);

  let linked = 0;

  for (const row of rows) {
    const protocolId = normalizeProtocolCandidate(row.slug) || normalizeProtocolId(row.name);
    const protocolName = normalizeDisplayName(row.name || row.slug || row.id);
    const hasExistingSources = await protocolHasSources(protocolId);

    await upsertProtocolSource({
      protocolId,
      protocolName,
      aliases: uniqueStrings([row.slug, row.name]),
      categories: [],
      website: null,
      avatar: row.icon,
      source: "tally",
      sourceId: row.id,
      sourceKind: "tally-organization",
      sourceSlug: row.slug,
      sourceName: row.name,
      isPrimary: !hasExistingSources,
      confidence: "medium",
    });
    linked += 1;
  }

  return linked;
}

async function upsertProtocolSource(input: {
  protocolId: string;
  protocolName: string;
  aliases: string[];
  categories: string[];
  website: string | null;
  avatar: string | null;
  source: string;
  sourceId: string;
  sourceKind: string;
  sourceSlug: string | null;
  sourceName: string | null;
  isPrimary: boolean;
  confidence: string;
  linkedBy?: string;
}) {
  const linkedBy = input.linkedBy ?? "auto-link-governance-protocols";
  const existingSourceRef = await getProtocolSourceBySourceRef(input.source, input.sourceId);

  if (existingSourceRef?.linkedBy?.startsWith("manual") && !linkedBy.startsWith("manual")) {
    console.log(
      `[protocol-link] preserving manual source ref ${input.source}:${input.sourceId} -> ${existingSourceRef.protocolId}`
    );
    return;
  }

  const slug = input.protocolId;
  const existingProtocol = await getProtocol(input.protocolId);
  const protocolValues = {
    id: input.protocolId,
    slug,
    name: input.protocolName || existingProtocol?.name || input.protocolId,
    aliases: mergeStrings(existingProtocol?.aliases, input.aliases),
    categories: mergeStrings(existingProtocol?.categories, input.categories),
    website: existingProtocol?.website || input.website,
    avatar: existingProtocol?.avatar || input.avatar,
    updatedAt: drizzleSql`now()`,
  };

  if (options.dryRun) {
    console.log(
      `[protocol-link] ${input.source}:${input.sourceId} -> ${input.protocolId} (${input.sourceName ?? input.protocolName})`
    );
    return;
  }

  await db
    .insert(governanceProtocols)
    .values(protocolValues)
    .onConflictDoUpdate({
      target: governanceProtocols.id,
      set: {
        name: protocolValues.name,
        aliases: protocolValues.aliases,
        categories: protocolValues.categories,
        website: protocolValues.website,
        avatar: protocolValues.avatar,
        updatedAt: drizzleSql`now()`,
      },
    });

  await db
    .insert(governanceProtocolSources)
    .values({
      protocolId: input.protocolId,
      source: input.source,
      sourceId: input.sourceId,
      sourceKind: input.sourceKind,
      sourceSlug: input.sourceSlug,
      sourceName: input.sourceName,
      isPrimary: input.isPrimary,
      confidence: input.confidence,
      linkedBy,
      updatedAt: drizzleSql`now()`,
    })
    .onConflictDoUpdate({
      target: [governanceProtocolSources.source, governanceProtocolSources.sourceId],
      set: {
        protocolId: input.protocolId,
        sourceKind: input.sourceKind,
        sourceSlug: input.sourceSlug,
        sourceName: input.sourceName,
        isPrimary: input.isPrimary,
        confidence: input.confidence,
        linkedBy,
        updatedAt: drizzleSql`now()`,
      },
    });
}

async function getProtocol(protocolId: string) {
  const [row] = await db
    .select({
      id: governanceProtocols.id,
      name: governanceProtocols.name,
      aliases: governanceProtocols.aliases,
      categories: governanceProtocols.categories,
      website: governanceProtocols.website,
      avatar: governanceProtocols.avatar,
    })
    .from(governanceProtocols)
    .where(eq(governanceProtocols.id, protocolId))
    .limit(1);

  return row ?? null;
}

async function getProtocolSourceBySourceRef(source: string, sourceId: string) {
  const [row] = await db
    .select({
      protocolId: governanceProtocolSources.protocolId,
      linkedBy: governanceProtocolSources.linkedBy,
    })
    .from(governanceProtocolSources)
    .where(and(eq(governanceProtocolSources.source, source), eq(governanceProtocolSources.sourceId, sourceId)))
    .limit(1);

  return row ?? null;
}

async function protocolHasSources(protocolId: string) {
  const [row] = await db
    .select({ protocolId: governanceProtocolSources.protocolId })
    .from(governanceProtocolSources)
    .where(eq(governanceProtocolSources.protocolId, protocolId))
    .limit(1);

  return Boolean(row);
}

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function mergeStrings(existing: unknown, incoming: string[]) {
  const existingValues = Array.isArray(existing) ? existing.filter((value): value is string => typeof value === "string") : [];
  return uniqueStrings([...existingValues, ...incoming]);
}

type ManualSeed = {
  protocolId?: unknown;
  protocolName?: unknown;
  name?: unknown;
  aliases?: unknown;
  categories?: unknown;
  website?: unknown;
  avatar?: unknown;
  sources?: unknown;
};

type ManualSeedSource = {
  source: "snapshot" | "tally";
  sourceId: string;
  sourceKind: "snapshot-space" | "tally-organization" | "tally-governor";
  sourceSlug: string | null;
  sourceName: string | null;
  isPrimary: boolean;
  confidence: "manual" | "high" | "medium" | "low";
};

function readManualSeeds(seedFile: string): ManualSeed[] {
  const seedPath = resolve(seedFile);
  if (!existsSync(seedPath)) {
    console.log(`[protocol-link] seed file not found, skipping: ${seedFile}`);
    return [];
  }

  const parsed = JSON.parse(readFileSync(seedPath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Manual seed file must contain a JSON array: ${seedFile}`);
  }

  return parsed.filter((entry): entry is ManualSeed => Boolean(entry) && typeof entry === "object");
}

function resolveSeedProtocolId(seed: ManualSeed) {
  const rawId = readSeedString(seed.protocolId);
  if (rawId) return rawId;

  const rawName = readSeedString(seed.protocolName) ?? readSeedString(seed.name);
  if (!rawName) {
    throw new Error("Manual protocol seed requires protocolId, protocolName, or name.");
  }

  return normalizeProtocolCandidate(rawName) ?? normalizeProtocolId(rawName);
}

function readSeedSources(seed: ManualSeed): ManualSeedSource[] {
  if (!Array.isArray(seed.sources)) {
    throw new Error(`Manual protocol seed "${resolveSeedProtocolId(seed)}" requires a sources array.`);
  }

  return seed.sources
    .map((entry, index) => normalizeSeedSource(entry, index))
    .filter((source) => options.source === "all" || source.source === options.source);
}

function normalizeSeedSource(value: unknown, index: number): ManualSeedSource {
  if (!value || typeof value !== "object") {
    throw new Error("Manual protocol seed source must be an object.");
  }

  const record = value as Record<string, unknown>;
  const source = readSeedString(record.source);
  const sourceId = readSeedString(record.sourceId);

  if (source !== "snapshot" && source !== "tally") {
    throw new Error('Manual protocol seed source must be "snapshot" or "tally".');
  }

  if (!sourceId) {
    throw new Error(`Manual protocol seed source "${source}" requires sourceId.`);
  }

  return {
    source,
    sourceId,
    sourceKind: normalizeSeedSourceKind(source, readSeedString(record.sourceKind)),
    sourceSlug: readSeedString(record.sourceSlug) ?? readSeedString(record.slug) ?? null,
    sourceName: readSeedString(record.sourceName) ?? readSeedString(record.name) ?? null,
    isPrimary: typeof record.isPrimary === "boolean" ? record.isPrimary : index === 0,
    confidence: normalizeSeedConfidence(readSeedString(record.confidence)),
  };
}

function normalizeSeedSourceKind(source: "snapshot" | "tally", value: string | null) {
  if (source === "snapshot") return "snapshot-space";
  if (value === "tally-governor") return "tally-governor";
  return "tally-organization";
}

function normalizeSeedConfidence(value: string | null) {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "manual";
}

function readSeedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readSeedStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((entry) => readSeedString(entry)));
}

function readStringArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1]?.trim() || null;
}

function readNumberArg(flag: string) {
  const raw = readStringArg(flag);
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
