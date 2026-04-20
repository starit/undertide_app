import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const HUB_URL = "https://hub.snapshot.org/graphql";
const SPACE_PAGE_SIZE = 50;
const PROPOSAL_PAGE_SIZE = 100;

const args = new Set(process.argv.slice(2));
const options = {
  full: args.has("--full"),
  spacesOnly: args.has("--spaces-only"),
  proposalsOnly: args.has("--proposals-only"),
};

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
}

const sql = neon(databaseUrl);

async function main() {
  console.log("Starting Snapshot sync...");

  if (!options.proposalsOnly) {
    await runSync("spaces", syncSpaces);
  }

  if (!options.spacesOnly) {
    await runSync("proposals", syncProposals);
  }

  console.log("Snapshot sync completed.");
}

async function runSync(entityType, task) {
  const runId = await startSyncRun(entityType);

  try {
    const rowsUpserted = await task();
    await finishSyncRun(runId, "success", rowsUpserted);
    await upsertSyncState(entityType, {
      last_success_at: new Date().toISOString(),
      last_error: null,
    });
    console.log(`[${entityType}] synced ${rowsUpserted} rows`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSyncRun(runId, "failed", 0, message);
    await upsertSyncState(entityType, {
      last_error: message,
    });
    throw error;
  }
}

async function syncSpaces() {
  let skip = 0;
  let upserted = 0;

  while (true) {
    const batch = await fetchGraphQL(
      `
        query GetSpaces($first: Int!, $skip: Int!) {
          spaces(
            first: $first
            skip: $skip
            orderBy: "created"
            orderDirection: asc
          ) {
            id
            name
            about
            network
            symbol
            strategies {
              name
              network
              params
            }
            admins
            members
            filters {
              minScore
              onlyMembers
            }
            plugins
          }
        }
      `,
      { first: SPACE_PAGE_SIZE, skip }
    );

    const spaces = batch?.spaces ?? [];
    if (spaces.length === 0) break;

    for (const space of spaces) {
      await upsertSpace(space);
      await replaceSpaceMembers(space.id, space.members ?? []);
      upserted += 1;
    }

    skip += spaces.length;
    console.log(`[spaces] fetched ${skip}`);

    if (spaces.length < SPACE_PAGE_SIZE) break;
  }

  return upserted;
}

async function syncProposals() {
  const previousState = options.full ? null : await getSyncState("proposals");
  const lastCreatedTs = previousState?.last_created_ts ? Number(previousState.last_created_ts) : null;

  let skip = 0;
  let upserted = 0;
  let highestCreatedTs = lastCreatedTs ?? 0;
  let shouldStop = false;

  while (!shouldStop) {
    const batch = await fetchGraphQL(
      `
        query GetProposals($first: Int!, $skip: Int!) {
          proposals(
            first: $first
            skip: $skip
            orderBy: "created"
            orderDirection: desc
          ) {
            id
            title
            body
            choices
            start
            end
            snapshot
            state
            author
            created
            scores
            scores_by_strategy
            scores_total
            scores_updated
            plugins
            network
            strategies {
              name
              network
              params
            }
            space {
              id
              name
            }
          }
        }
      `,
      { first: PROPOSAL_PAGE_SIZE, skip }
    );

    const proposals = batch?.proposals ?? [];
    if (proposals.length === 0) break;

    for (const proposal of proposals) {
      if (!proposal?.space?.id) continue;

      highestCreatedTs = Math.max(highestCreatedTs, Number(proposal.created ?? 0));
      await upsertProposal(proposal);
      upserted += 1;

      if (!options.full && lastCreatedTs && Number(proposal.created ?? 0) <= lastCreatedTs) {
        shouldStop = true;
      }
    }

    skip += proposals.length;
    console.log(`[proposals] fetched ${skip}`);

    if (proposals.length < PROPOSAL_PAGE_SIZE) break;
  }

  await upsertSyncState("proposals", {
    last_created_ts: highestCreatedTs || null,
  });

  return upserted;
}

async function fetchGraphQL(query, variables) {
  const response = await fetch(HUB_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Snapshot API request failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(`Snapshot API error: ${json.errors.map((entry) => entry.message).join("; ")}`);
  }

  return json.data;
}

async function upsertSpace(space) {
  await sql(
    `
      insert into snapshot_spaces (
        id,
        name,
        about,
        network,
        symbol,
        admins,
        member_count,
        strategies,
        filters,
        plugins,
        raw,
        last_seen_at,
        last_synced_at
      )
      values (
        $1, $2, $3, $4, $5,
        $6::jsonb,
        $7,
        $8::jsonb,
        $9::jsonb,
        $10::jsonb,
        $11::jsonb,
        now(),
        now()
      )
      on conflict (id) do update set
        name = excluded.name,
        about = excluded.about,
        network = excluded.network,
        symbol = excluded.symbol,
        admins = excluded.admins,
        member_count = excluded.member_count,
        strategies = excluded.strategies,
        filters = excluded.filters,
        plugins = excluded.plugins,
        raw = excluded.raw,
        last_seen_at = now(),
        last_synced_at = now()
    `,
    [
      space.id,
      space.name ?? space.id,
      space.about ?? null,
      space.network ?? null,
      space.symbol ?? null,
      JSON.stringify(space.admins ?? []),
      Array.isArray(space.members) ? space.members.length : 0,
      JSON.stringify(space.strategies ?? []),
      JSON.stringify(space.filters ?? null),
      JSON.stringify(space.plugins ?? null),
      JSON.stringify(space),
    ]
  );
}

async function replaceSpaceMembers(spaceId, members) {
  await sql("delete from snapshot_space_members where space_id = $1", [spaceId]);

  if (!Array.isArray(members) || members.length === 0) return;

  const chunkSize = 500;
  for (let index = 0; index < members.length; index += chunkSize) {
    const chunk = members.slice(index, index + chunkSize);
    const values = [];
    const params = [];

    for (let i = 0; i < chunk.length; i += 1) {
      const member = chunk[i];
      const offset = i * 2;
      values.push(`($${offset + 1}, $${offset + 2}, now(), now())`);
      params.push(spaceId, member);
    }

    await sql(
      `
        insert into snapshot_space_members (
          space_id,
          member_address,
          first_seen_at,
          last_seen_at
        )
        values ${values.join(", ")}
        on conflict (space_id, member_address) do update set
          last_seen_at = now()
      `,
      params
    );
  }
}

async function upsertProposal(proposal) {
  await sql(
    `
      insert into snapshot_proposals (
        id,
        space_id,
        title,
        body,
        choices,
        start_ts,
        end_ts,
        created_ts,
        snapshot_block,
        state,
        author,
        network,
        scores,
        scores_by_strategy,
        scores_total,
        scores_updated_ts,
        strategies,
        plugins,
        raw,
        last_seen_at,
        last_synced_at
      )
      values (
        $1, $2, $3, $4,
        $5::jsonb,
        $6, $7, $8, $9, $10, $11, $12,
        $13::jsonb,
        $14::jsonb,
        $15,
        $16,
        $17::jsonb,
        $18::jsonb,
        $19::jsonb,
        now(),
        now()
      )
      on conflict (id) do update set
        space_id = excluded.space_id,
        title = excluded.title,
        body = excluded.body,
        choices = excluded.choices,
        start_ts = excluded.start_ts,
        end_ts = excluded.end_ts,
        created_ts = excluded.created_ts,
        snapshot_block = excluded.snapshot_block,
        state = excluded.state,
        author = excluded.author,
        network = excluded.network,
        scores = excluded.scores,
        scores_by_strategy = excluded.scores_by_strategy,
        scores_total = excluded.scores_total,
        scores_updated_ts = excluded.scores_updated_ts,
        strategies = excluded.strategies,
        plugins = excluded.plugins,
        raw = excluded.raw,
        last_seen_at = now(),
        last_synced_at = now()
    `,
    [
      proposal.id,
      proposal.space.id,
      proposal.title ?? proposal.id,
      proposal.body ?? null,
      JSON.stringify(proposal.choices ?? []),
      Number(proposal.start ?? 0),
      Number(proposal.end ?? 0),
      Number(proposal.created ?? 0),
      proposal.snapshot ?? null,
      proposal.state ?? "unknown",
      proposal.author ?? "",
      proposal.network ?? null,
      JSON.stringify(proposal.scores ?? null),
      JSON.stringify(proposal.scores_by_strategy ?? null),
      proposal.scores_total ?? null,
      proposal.scores_updated ? Number(proposal.scores_updated) : null,
      JSON.stringify(proposal.strategies ?? []),
      JSON.stringify(proposal.plugins ?? null),
      JSON.stringify(proposal),
    ]
  );
}

async function startSyncRun(entityType) {
  const rows = await sql(
    `
      insert into snapshot_sync_runs (entity_type, status)
      values ($1, 'running')
      returning id
    `,
    [entityType]
  );
  return rows[0].id;
}

async function finishSyncRun(id, status, rowsUpserted, error = null) {
  await sql(
    `
      update snapshot_sync_runs
      set
        finished_at = now(),
        status = $2,
        rows_upserted = $3,
        error = $4
      where id = $1
    `,
    [id, status, rowsUpserted, error]
  );
}

async function getSyncState(entityType) {
  const rows = await sql(
    `
      select entity_type, last_success_at, last_cursor, last_created_ts, last_error, updated_at
      from snapshot_sync_state
      where entity_type = $1
      limit 1
    `,
    [entityType]
  );
  return rows[0] ?? null;
}

async function upsertSyncState(entityType, patch) {
  const previous = (await getSyncState(entityType)) ?? {};

  await sql(
    `
      insert into snapshot_sync_state (
        entity_type,
        last_success_at,
        last_cursor,
        last_created_ts,
        last_error,
        updated_at
      )
      values ($1, $2, $3, $4, $5, now())
      on conflict (entity_type) do update set
        last_success_at = excluded.last_success_at,
        last_cursor = excluded.last_cursor,
        last_created_ts = excluded.last_created_ts,
        last_error = excluded.last_error,
        updated_at = now()
    `,
    [
      entityType,
      patch.last_success_at ?? previous.last_success_at ?? null,
      patch.last_cursor ?? previous.last_cursor ?? null,
      patch.last_created_ts ?? previous.last_created_ts ?? null,
      patch.last_error ?? null,
    ]
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
