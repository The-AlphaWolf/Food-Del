/**
 * Test database helpers. Tests run against `TEST_DATABASE_URL`, which is wiped and rebuilt from
 * migrations once per test file. Never point this at a database you care about.
 */
import { sql } from "drizzle-orm";
import { createDb, type DbHandle } from "./client";
import { runMigrations } from "./migrate";
import { type SeedOptions, seed } from "./seed";

export function testDatabaseUrl(): string {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgres://fooddel:fooddel@localhost:5432/fooddel_test";
  if (!/test/.test(url)) {
    throw new Error(`Refusing to run tests against a non-test database: ${url}`);
  }
  return url;
}

/**
 * Each package, and each Vitest worker within it, gets its own database
 * (`<test db>_<package>_<worker>`) so suites and test files run in parallel without one
 * dropping another's schema mid-test.
 */
async function packageDatabaseUrl(): Promise<string> {
  const base = new URL(testDatabaseUrl());
  const pkg = (process.env.npm_package_name ?? "default")
    .replace(/^@food-del\//, "")
    .replace(/\W+/g, "_");
  const worker = process.env.VITEST_POOL_ID ? `_${process.env.VITEST_POOL_ID}` : "";
  const name = `${base.pathname.slice(1)}_${pkg}${worker}`;
  const admin = createDb(base.toString(), { max: 1 });
  try {
    const exists = await admin.db.execute(sql`select 1 from pg_database where datname = ${name}`);
    if (exists.length === 0) await admin.db.execute(sql.raw(`create database "${name}"`));
  } finally {
    await admin.close();
  }
  base.pathname = `/${name}`;
  return base.toString();
}

/** Fresh schema with migrations applied. */
export async function createTestDb(options: { max?: number } = {}): Promise<DbHandle> {
  const handle = createDb(await packageDatabaseUrl(), { max: options.max ?? 10 });
  await handle.db.execute(sql`drop schema if exists public cascade`);
  await handle.db.execute(sql`drop schema if exists drizzle cascade`);
  await handle.db.execute(sql`create schema public`);
  await runMigrations(handle.db);
  return handle;
}

/** Fresh schema, migrated and seeded with the launch catalogue. */
export async function createSeededTestDb(
  seedOptions: Partial<SeedOptions> & { today: Date },
  options: { max?: number } = {},
): Promise<DbHandle> {
  const handle = await createTestDb(options);
  await seed(handle.db, seedOptions);
  return handle;
}
