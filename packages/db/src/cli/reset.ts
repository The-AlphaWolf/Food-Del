/** Drop everything and rebuild: migrations + seed. Local development only. */
import { sql } from "drizzle-orm";
import { createDb } from "../client";
import { runMigrations } from "../migrate";
import { seed } from "../seed";
import { databaseUrl } from "./env";

const url = databaseUrl();
if (/supabase\.(co|com)|amazonaws\.com/.test(url) && process.env.ALLOW_REMOTE_RESET !== "1") {
  console.error(
    "Refusing to reset a remote database. Set ALLOW_REMOTE_RESET=1 if you really mean it.",
  );
  process.exit(1);
}
const { db, close } = createDb(url, { max: 1 });
try {
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await runMigrations(db);
  const summary = await seed(db, { today: new Date() });
  console.log("Database reset.", summary);
} finally {
  await close();
}
