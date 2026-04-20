import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
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
    network: text("network"),
    symbol: text("symbol"),
    admins: jsonb("admins").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    memberCount: integer("member_count").notNull().default(0),
    strategies: jsonb("strategies").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    filters: jsonb("filters").$type<Record<string, unknown> | null>(),
    plugins: jsonb("plugins").$type<Record<string, unknown> | null>(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    snapshotCreatedAt: timestamp("snapshot_created_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    networkIdx: index("idx_snapshot_spaces_network").on(table.network),
    lastSeenAtIdx: index("idx_snapshot_spaces_last_seen_at").on(table.lastSeenAt),
  })
);

export const snapshotSpaceMembers = pgTable(
  "snapshot_space_members",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => snapshotSpaces.id, { onDelete: "cascade" }),
    memberAddress: text("member_address").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
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
    spaceId: text("space_id")
      .notNull()
      .references(() => snapshotSpaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    choices: jsonb("choices").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    startTs: bigint("start_ts", { mode: "number" }).notNull(),
    endTs: bigint("end_ts", { mode: "number" }).notNull(),
    createdTs: bigint("created_ts", { mode: "number" }).notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).generatedAlwaysAs(sql`to_timestamp(start_ts)`),
    endAt: timestamp("end_at", { withTimezone: true }).generatedAlwaysAs(sql`to_timestamp(end_ts)`),
    createdAt: timestamp("created_at", { withTimezone: true }).generatedAlwaysAs(sql`to_timestamp(created_ts)`),
    snapshotBlock: text("snapshot_block"),
    state: text("state").notNull(),
    author: text("author").notNull(),
    network: text("network"),
    scores: jsonb("scores").$type<number[] | null>(),
    scoresByStrategy: jsonb("scores_by_strategy").$type<number[][] | null>(),
    scoresTotal: numeric("scores_total"),
    scoresUpdatedTs: bigint("scores_updated_ts", { mode: "number" }),
    scoresUpdatedAt: timestamp("scores_updated_at", { withTimezone: true }).generatedAlwaysAs(
      sql`case when scores_updated_ts is null then null else to_timestamp(scores_updated_ts) end`
    ),
    strategies: jsonb("strategies").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    plugins: jsonb("plugins").$type<Record<string, unknown> | null>(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    spaceIdIdx: index("idx_snapshot_proposals_space_id").on(table.spaceId),
    stateIdx: index("idx_snapshot_proposals_state").on(table.state),
    createdAtIdx: index("idx_snapshot_proposals_created_at").on(table.createdAt),
    endAtIdx: index("idx_snapshot_proposals_end_at").on(table.endAt),
    authorIdx: index("idx_snapshot_proposals_author").on(table.author),
  })
);

export const proposalEnrichments = pgTable("proposal_enrichments", {
  proposalId: text("proposal_id")
    .primaryKey()
    .references(() => snapshotProposals.id, { onDelete: "cascade" }),
  readableContent: text("readable_content"),
  aiSummary: text("ai_summary"),
  importanceLabel: text("importance_label"),
  riskLabels: jsonb("risk_labels").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  facts: jsonb("facts").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  locale: text("locale").notNull().default("en"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const snapshotSyncState = pgTable("snapshot_sync_state", {
  entityType: text("entity_type").primaryKey(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastCursor: text("last_cursor"),
  lastCreatedTs: bigint("last_created_ts", { mode: "number" }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const snapshotSyncRuns = pgTable(
  "snapshot_sync_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entityType: text("entity_type").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull(),
    rowsUpserted: integer("rows_upserted").notNull().default(0),
    error: text("error"),
  },
  (table) => ({
    entityTypeIdx: index("idx_snapshot_sync_runs_entity_type").on(table.entityType),
    startedAtIdx: index("idx_snapshot_sync_runs_started_at").on(table.startedAt),
  })
);

export const schema = {
  snapshotSpaces,
  snapshotSpaceMembers,
  snapshotProposals,
  proposalEnrichments,
  snapshotSyncState,
  snapshotSyncRuns,
};
