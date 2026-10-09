import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "./client";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
