import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const snapshotSpaces = pgTable(
  "snapshot_spaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    about: text("about"),
    avatar: text("avatar"),
    network: text("network"),
    symbol: text("symbol"),
    verified: boolean("verified").notNull().default(false),
    categories: jsonb("categories").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    followersCount: integer("followers_count").notNull().default(0),
    votesCount: integer("votes_count").notNull().default(0),
    twitter: text("twitter"),
    github: text("github"),
    coingecko: text("coingecko"),
    website: text("website"),
    discussions: text("discussions"),
    flagged: boolean("flagged").notNull().default(false),
    flagCode: integer("flag_code").notNull().default(0),
    hibernated: boolean("hibernated").notNull().default(false),
    turbo: boolean("turbo").notNull().default(false),
    activeProposals: integer("active_proposals").notNull().default(0),
    admins: jsonb("admins").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    memberCount: integer("member_count").notNull().default(0),
    proposalCount: integer("proposal_count").notNull().default(0),
    strategies: jsonb("strategies").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    filters: jsonb("filters").$type<Record<string, unknown> | null>(),
    plugins: jsonb("plugins").$type<Record<string, unknown> | null>(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    snapshotCreatedAt: timestamp("snapshot_created_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    networkIdx: index("idx_snapshot_spaces_network").on(table.network),
    createdAtIdx: index("idx_snapshot_spaces_created_at").on(table.createdAt),
  })
);

export const snapshotSpaceMembers = pgTable(
  "snapshot_space_members",
  {
    spaceId: text("space_id").notNull(),
    memberAddress: text("member_address").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.spaceId, table.memberAddress] }),
    memberAddressIdx: index("idx_snapshot_space_members_member_address").on(table.memberAddress),
    spaceIdIdx: index("idx_snapshot_space_members_space_id").on(table.spaceId),
  })
);

export const snapshotProposals = pgTable(
  "snapshot_proposals",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    choices: jsonb("choices").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    startTs: bigint("start_ts", { mode: "number" }).notNull(),
    endTs: bigint("end_ts", { mode: "number" }).notNull(),
    createdTs: bigint("created_ts", { mode: "number" }).notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).generatedAlwaysAs(sql`to_timestamp(start_ts)`),
    endAt: timestamp("end_at", { withTimezone: true }).generatedAlwaysAs(sql`to_timestamp(end_ts)`),
    createdAt: timestamp("created_at", { withTimezone: true }).generatedAlwaysAs(sql`to_timestamp(created_ts)`),
    ipfs: text("ipfs"),
    type: text("type"),
    discussion: text("discussion"),
    flagged: boolean("flagged").notNull().default(false),
    flagCode: integer("flag_code").notNull().default(0),
    symbol: text("symbol"),
    labels: jsonb("labels").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    quorum: numeric("quorum"),
    quorumType: text("quorum_type"),
    privacy: text("privacy"),
    link: text("link"),
    app: text("app"),
    snapshotBlock: text("snapshot_block"),
    state: text("state").notNull(),
    author: text("author").notNull(),
    network: text("network"),
    scores: jsonb("scores").$type<number[] | null>(),
    scoresByStrategy: jsonb("scores_by_strategy").$type<number[][] | null>(),
    scoresTotal: numeric("scores_total"),
    scoresState: text("scores_state"),
    scoresTotalValue: numeric("scores_total_value"),
    scoresUpdatedTs: bigint("scores_updated_ts", { mode: "number" }),
    scoresUpdatedAt: timestamp("scores_updated_at", { withTimezone: true }).generatedAlwaysAs(
      sql`case when scores_updated_ts is null then null else to_timestamp(scores_updated_ts) end`
    ),
    votesCount: integer("votes_count").notNull().default(0),
    updatedTs: bigint("updated_ts", { mode: "number" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).generatedAlwaysAs(
      sql`case when updated_ts is null then null else to_timestamp(updated_ts) end`
    ),
    strategies: jsonb("strategies").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    plugins: jsonb("plugins").$type<Record<string, unknown> | null>(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    spaceIdIdx: index("idx_snapshot_proposals_space_id").on(table.spaceId),
    stateIdx: index("idx_snapshot_proposals_state").on(table.state),
    createdAtIdx: index("idx_snapshot_proposals_created_at").on(table.createdAt),
    endAtIdx: index("idx_snapshot_proposals_end_at").on(table.endAt),
    authorIdx: index("idx_snapshot_proposals_author").on(table.author),
  })
);


export const proposalTranslations = pgTable(
  "proposal_translations",
  {
    proposalId: text("proposal_id").notNull(),
    locale: text("locale").notNull(),
    title: text("title"),
    body: text("body"),
    summary: text("summary"),
    translatedBy: text("translated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.proposalId, table.locale] }),
    localeIdx: index("idx_proposal_translations_locale").on(table.locale),
    proposalIdIdx: index("idx_proposal_translations_proposal_id").on(table.proposalId),
  })
);

export const snapshotSyncState = pgTable("snapshot_sync_state", {
  entityType: text("entity_type").primaryKey(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastCursor: text("last_cursor"),
  lastCreatedTs: bigint("last_created_ts", { mode: "number" }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const snapshotSyncRuns = pgTable(
  "snapshot_sync_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entityType: text("entity_type").notNull(),
    status: text("status").notNull(),
    rowsUpserted: integer("rows_upserted").notNull().default(0),
    error: text("error"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => ({
    entityTypeIdx: index("idx_snapshot_sync_runs_entity_type").on(table.entityType),
    createdAtIdx: index("idx_snapshot_sync_runs_created_at").on(table.createdAt),
  })
);

export const schema = {
  snapshotSpaces,
  snapshotSpaceMembers,
  snapshotProposals,
  proposalTranslations,
  snapshotSyncState,
  snapshotSyncRuns,
};
