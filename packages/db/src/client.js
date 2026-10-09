import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
/**
 * Connect to Postgres. `prepare: false` keeps us compatible with Supabase's transaction-mode
 * pooler (Supavisor), which does not support prepared statements.
 */
export function createDb(url, options = {}) {
  const client = postgres(url, {
    max: options.max ?? 10,
    prepare: false,
    onnotice: () => {},
  });
  return {
    db: drizzle(client, { schema, casing: "snake_case" }),
    close: () => client.end({ timeout: 5 }),
  };
}
