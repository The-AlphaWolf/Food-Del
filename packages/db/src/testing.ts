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

/** Fresh schema with migrations applied. */
export async function createTestDb(options: { max?: number } = {}): Promise<DbHandle> {
  const handle = createDb(testDatabaseUrl(), { max: options.max ?? 10 });
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
