/**
 * CPU cost per request of the public shopper endpoints, in-process (no HTTP server), so
 * regressions in planning cost show up before a load test does.
 *
 *   DATABASE_URL=… NODE_ENV=production pnpm --filter @food-del/api bench [scenario]
 */
import { createCore, DEFAULT_CONFIG, silentLogger } from "@food-del/core";
import { createDb } from "@food-del/db";
import { FakeCarrier, FakePaymentProvider, RecordingNotifier } from "@food-del/integrations";
import { createApi } from "../src/app";

const { db } = createDb(process.env.DATABASE_URL!, { max: 5 });
const core = createCore({
  db,
  clock: () => new Date(),
  payments: new FakePaymentProvider(),
  carrier: new FakeCarrier(),
  notifier: new RecordingNotifier(),
  config: DEFAULT_CONFIG,
  logger: silentLogger,
});
const api = createApi(core, {
  basePath: "/api",
  auth: { mode: "dev", devSecret: "x".repeat(40) },
  devTools: false,
  cronSecret: null,
  secureCookies: false,
});
const items = (await (await api.request("/api/v1/items?limit=100")).json()) as { slug: string }[];
const detail = (await (await api.request(`/api/v1/items/${items[0]!.slug}`)).json()) as {
  variants: { id: string }[];
};
const v = detail.variants[0]!.id;
const pins = ["560038", "400010", "600084", "500065", "700017"];
const scen: Record<string, (i: number) => Response | Promise<Response>> = {
  catalogue: (i) => api.request(`/api/v1/items?pincode=${pins[i % 5]}&limit=24`),
  item: (i) => api.request(`/api/v1/items/${items[i % items.length]!.slug}?pincode=${pins[i % 5]}`),
  calendar: (i) =>
    api.request(`/api/v1/availability?pincode=${pins[i % 5]}&variantId=${v}&days=21`),
  quote: (i) =>
    api.request("/api/v1/quotes", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": `1.1.1.${i % 250}` },
      body: JSON.stringify({ pincode: pins[i % 5], lines: [{ variantId: v, quantity: 1 }] }),
    }),
  pincode: (i) =>
    api.request(`/api/v1/pincodes/${pins[i % 5]}`, {
      headers: { "x-real-ip": `1.1.2.${i % 250}` },
    }),
  reference: () => api.request("/api/v1/cities"),
};
const only = process.argv[2];
for (const [name, f] of Object.entries(scen)) {
  if (only && only !== name) continue;
  for (let i = 0; i < 20; i++) await (await f(i)).arrayBuffer();
  const N = 200;
  const c0 = process.cpuUsage();
  const t0 = performance.now();
  for (let i = 0; i < N; i++) await (await f(i)).arrayBuffer();
  const cpu = process.cpuUsage(c0);
  const wall = performance.now() - t0;
  console.log(
    `${name.padEnd(10)} ${(wall / N).toFixed(2)} ms wall  ${((cpu.user + cpu.system) / 1000 / N).toFixed(2)} ms CPU / request`,
  );
}
process.exit(0);
