# Database Workflow

This project uses **Drizzle + Neon** for schema and migration management.

## Source of truth

- Type-safe schema: `db/drizzle-schema.ts`
- Generated Drizzle migrations: `db/migrations/drizzle`
- Human-readable reference schema: `db/schema.sql`
- Initial handcrafted migration kept for reference: `db/migrations/0001_snapshot_ingest.sql`

## Commands

- Generate a new migration after schema changes:

  `pnpm db:generate`

- Apply generated migrations to the configured database:

  `pnpm db:migrate`

- Push the current schema directly to the database without creating a migration:

  `pnpm db:push`

- Check whether the Drizzle schema and migration state are in sync:

  `pnpm db:check`

- Open Drizzle Studio:

  `pnpm db:studio`

## Recommended flow

1. Edit `db/drizzle-schema.ts`
2. Run `pnpm db:generate`
3. Review the SQL in `db/migrations/drizzle`
4. Run `pnpm db:migrate`

Use `db:push` only for rapid local iteration, not as the main production migration path.
