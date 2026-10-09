import { createDb } from "../client";
import { runMigrations } from "../migrate";
import { databaseUrl } from "./env";

const { db, close } = createDb(databaseUrl(), { max: 1 });
try {
  await runMigrations(db);
  console.log("Migrations applied.");
} finally {
  await close();
}
