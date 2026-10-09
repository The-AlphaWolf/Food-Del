import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));
export async function runMigrations(db) {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
