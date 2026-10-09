import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run queries: the pool or an open transaction. */
export type Executor = Database | Transaction;

export interface DbHandle {
  db: Database;
  close(): Promise<void>;
}

/**
 * Connect to Postgres. `prepare: false` keeps us compatible with Supabase's transaction-mode
 * pooler (Supavisor), which does not support prepared statements.
 */
export function createDb(url: string, options: { max?: number } = {}): DbHandle {
  const client = postgres(url, {
    max: options.max ?? 10,
    prepare: false,
    onnotice: () => {},
  });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}
