# Deploy, migrate, roll back

`main` deploys to production on Vercel when CI is green. Previews deploy for every branch.

## Before merging
- CI green: lint, typecheck, unit/integration tests, build, Playwright journeys.
- New migration? Check that it is **backwards compatible**: the code that's live now must keep working against the new schema.
  - **Allowed:** add tables, add nullable columns or columns with defaults, add indexes.
  - **Needs two releases:** renaming or dropping a column. Ship code that stops using it first, drop it in a later release.

## Running migrations
Migrations are not run by the build. Run them **before** the code that needs them goes live:

```sh
# Supabase direct connection (port 5432), not the transaction pooler: migrations need a session.
DATABASE_URL='postgres://…:5432/postgres' pnpm db:migrate
```

- Run against staging first, then production.
- `drizzle.__drizzle_migrations` records what has run. Re-running is a no-op.
- Every new table must enable row-level security (a test fails otherwise).
- Large tables: create indexes `CONCURRENTLY` in a hand-edited migration, and do it outside festival weeks.

## Rolling back code
Vercel → Deployments → the last good deployment → **Instant Rollback**. It takes seconds and needs no rebuild. Because migrations are backwards compatible, the old code runs fine on the new schema.

Then:
- revert the commit on `main` so the next deploy doesn't bring it back;
- check System health and readiness.

## Rolling back a migration
There are no down-migrations. If a migration itself is wrong, write a new forward migration that fixes it.

If data was damaged, restore with Supabase point-in-time recovery to a new project, copy the affected rows back, and run it as a SEV1 with a second person checking every step.

## Environment variables
- Change them in Vercel, then **redeploy**; running functions keep the old values.
- Never paste production secrets into chat or tickets.
- Rotate per environment. Staging and production never share keys.
