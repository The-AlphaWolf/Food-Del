/**
 * The whole Food-Del backend in one JavaScript context: Postgres (PGlite, compiled to
 * WebAssembly), the core services and the HTTP API, with fake payments and courier. The GitHub
 * Pages demo runs this inside a service worker so the unchanged web app can call `/api/*`.
 */
import { PGlite, type PGliteOptions } from "@electric-sql/pglite";
import { createApi } from "@food-del/api";
import { createCore, DEFAULT_CONFIG, type Logger, silentLogger } from "@food-del/core";
import type { Database } from "@food-del/db";
import { schema } from "@food-del/db";
import { seed } from "@food-del/db/seed";
import { FakeCarrier, FakePaymentProvider, RecordingNotifier } from "@food-del/integrations";
import { drizzle } from "drizzle-orm/pglite";
import { MIGRATIONS } from "./migrations.gen";

export interface DemoBackendOptions {
  /** `idb://name` to persist in IndexedDB (browser), `memory://` or a directory (Node). */
  dataDir?: string;
  /** Where the API is mounted, e.g. "/Food-Del/api". */
  basePath: string;
  /** The site's public URL (links in messages and labels). */
  appUrl: string;
  clock?: () => Date;
  logger?: Logger;
  /** Extra PGlite options, e.g. preloaded WebAssembly modules in a service worker. */
  pglite?: PGliteOptions;
  /** Startup progress, for a loading screen. */
  onProgress?: (stage: string) => void;
}

/**
 * postgres.js returns raw query results as an array of rows; PGlite returns `{ rows }`. Core code
 * is written against the former, so present PGlite's results the same way.
 */
function arrayResults(db: object): void {
  const session = (db as { session: { prepareQuery: (...a: unknown[]) => object } }).session;
  const prepared = session.prepareQuery(
    { sql: "select 1", params: [] },
    undefined,
    undefined,
    false,
  );
  const proto = Object.getPrototypeOf(prepared) as {
    execute: (...a: unknown[]) => Promise<unknown>;
    __rowsPatched?: boolean;
  };
  if (proto.__rowsPatched) return;
  const original = proto.execute;
  proto.execute = async function (this: unknown, ...a: unknown[]) {
    const r = (await original.apply(this, a)) as { rows?: unknown[] } | unknown[];
    return Array.isArray(r) || !r || !("rows" in r) ? r : r.rows;
  };
  proto.__rowsPatched = true;
}

async function migrate(client: PGlite): Promise<number> {
  await client.exec(
    "create table if not exists demo_migrations (tag text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set(
    (await client.query<{ tag: string }>("select tag from demo_migrations")).rows.map((r) => r.tag),
  );
  let applied = 0;
  for (const m of MIGRATIONS) {
    if (done.has(m.tag)) continue;
    await client.transaction(async (tx) => {
      for (const statement of m.statements) await tx.exec(statement);
      await tx.query("insert into demo_migrations (tag) values ($1)", [m.tag]);
    });
    applied++;
  }
  return applied;
}

export async function createDemoBackend(options: DemoBackendOptions) {
  const clock = options.clock ?? (() => new Date());
  const progress = options.onProgress ?? (() => {});
  progress("Starting Postgres");
  const client = new PGlite({ ...options.pglite, dataDir: options.dataDir ?? "memory://" });
  await client.waitReady;
  progress("Creating tables");
  await migrate(client);
  const db = drizzle(client, { schema }) as unknown as Database;
  arrayResults(db);
  progress("Loading kitchens and delicacies");
  await seed(db, { today: clock() });

  const core = createCore({
    db,
    clock,
    payments: new FakePaymentProvider(),
    carrier: new FakeCarrier(`${options.basePath}/v1/dev/labels`),
    notifier: new RecordingNotifier(false),
    config: { ...DEFAULT_CONFIG, appUrl: options.appUrl, opsPhone: "+919900000002" },
    logger: options.logger ?? silentLogger,
  });
  const api = createApi(core, {
    basePath: options.basePath,
    auth: { mode: "dev", devSecret: "food-del-static-demo-runs-in-your-browser-only" },
    devTools: true,
    cronSecret: null,
    secureCookies: false,
    // One person, one browser: rate limits would only get in the way of trying things.
    rateLimits: false,
  });
  return {
    api,
    core,
    client,
    /** Run the scheduled jobs a server would (batch locking, queued work, holds…). */
    async tick(): Promise<void> {
      for (const job of [
        "materialize-slots",
        "expire-holds",
        "lock-batches",
        "monitor-at-risk",
        "release-payouts",
        "process-outbox",
      ] as const) {
        await core.runJob(job).catch(() => {});
      }
    },
  };
}

export type DemoBackend = Awaited<ReturnType<typeof createDemoBackend>>;
