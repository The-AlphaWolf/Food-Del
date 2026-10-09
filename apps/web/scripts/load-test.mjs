#!/usr/bin/env node
/**
 * Festival load test: an open-loop mix of shoppers browsing, checking dates and quoting, plus a
 * steady stream of paid orders, against a running Food-Del (dev or demo auth).
 *
 *   node scripts/load-test.mjs --base http://localhost:3000 --rps 50 --orders-per-min 10 --duration 120
 *
 * Open loop means requests start on schedule whatever the server's latency, so a slow server
 * shows up as rising latency and errors instead of quietly reducing the load (closed-loop tools
 * hide this). Each virtual shopper gets its own client IP header, as real traffic would have.
 *
 * Exits 1 if any threshold in THRESHOLDS fails. Results also go to --out as JSON.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:3000" },
    rps: { type: "string", default: "50" },
    "orders-per-min": { type: "string", default: "10" },
    duration: { type: "string", default: "120" },
    customers: { type: "string", default: "40" },
    out: { type: "string" },
  },
});
const API = `${args.base.replace(/\/$/, "")}/api`;
const RPS = Number(args.rps);
const ORDERS_PER_MIN = Number(args["orders-per-min"]);
const DURATION_S = Number(args.duration);

/** Where festival orders go: the launch metros. */
const PINCODES = ["560038", "400010", "600084", "500065", "700017", "110001", "411001"];

/** Share of browsing traffic per scenario (orders run on their own schedule). */
const MIX = [
  ["catalogue", 0.3],
  ["item", 0.25],
  ["calendar", 0.15],
  ["quote", 0.15],
  ["pincode", 0.1],
  ["reference", 0.05],
];

/** p95 latency budgets in ms (local single instance) and the error budget. */
const THRESHOLDS = {
  catalogue: 400,
  item: 400,
  calendar: 600,
  quote: 600,
  pincode: 300,
  reference: 200,
  order: 1500,
  pay: 1500,
  errorRate: 0.005,
};

const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const ip = () =>
  `10.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${(Math.random() * 254 + 1) | 0}`;

const stats = new Map();
function record(name, ms, status) {
  let s = stats.get(name);
  if (!s) {
    s = { latencies: [], statuses: {} };
    stats.set(name, s);
  }
  s.latencies.push(ms);
  s.statuses[status] = (s.statuses[status] ?? 0) + 1;
}

async function call(name, method, path, { body, token, clientIp = ip(), headers = {} } = {}) {
  const t0 = performance.now();
  let status = 0;
  let data = null;
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "x-real-ip": clientIp,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    status = res.status;
    const text = await res.text();
    data = text ? JSON.parse(text) : null;
  } catch {
    status = 0;
  }
  if (name) record(name, performance.now() - t0, status);
  return { status, data };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

async function login(phone) {
  const clientIp = ip();
  await call(null, "POST", "/v1/auth/otp", { body: { phone }, clientIp });
  const r = await call(null, "POST", "/v1/auth/verify", {
    body: { phone, code: "123456" },
    clientIp,
  });
  if (r.status !== 200) throw new Error(`login ${phone}: ${r.status} ${JSON.stringify(r.data)}`);
  return { token: r.data.token, ip: clientIp };
}

console.log(`Setting up against ${API} …`);
const health = await call(null, "GET", "/v1/health");
if (health.status !== 200) throw new Error(`API not healthy: ${health.status}`);
const catalogue = await call(null, "GET", "/v1/items?limit=100");
const slugs = catalogue.data.map((i) => i.slug);
const variants = [];
for (const slug of slugs) {
  const d = await call(null, "GET", `/v1/items/${slug}`);
  for (const v of d.data.variants ?? []) variants.push({ slug, id: v.id });
}
const run = Date.now() % 1e6;
const customers = [];
for (let i = 0; i < Number(args.customers); i++) {
  customers.push(await login(`7${String(run).padStart(6, "0")}${String(i).padStart(3, "0")}`));
}
console.log(
  `${slugs.length} items, ${variants.length} variants, ${customers.length} customers. ` +
    `Running ${RPS} req/s browsing + ${ORDERS_PER_MIN} orders/min for ${DURATION_S}s.`,
);

// ─── Scenarios ───────────────────────────────────────────────────────────────

const scenarios = {
  catalogue: () => call("catalogue", "GET", `/v1/items?pincode=${pick(PINCODES)}&limit=24`),
  item: () => call("item", "GET", `/v1/items/${pick(slugs)}?pincode=${pick(PINCODES)}`),
  calendar: () =>
    call(
      "calendar",
      "GET",
      `/v1/availability?pincode=${pick(PINCODES)}&variantId=${pick(variants).id}&days=21`,
    ),
  quote: () =>
    call("quote", "POST", "/v1/quotes", {
      body: {
        pincode: pick(PINCODES),
        lines: [{ variantId: pick(variants).id, quantity: 1 + ((Math.random() * 2) | 0) }],
      },
    }),
  pincode: () => call("pincode", "GET", `/v1/pincodes/${pick(PINCODES)}`),
  reference: () => call("reference", "GET", pick(["/v1/cities", "/v1/categories"])),
};

const outcomes = { placed: 0, paid: 0, unavailable: 0 };
async function order() {
  const c = pick(customers);
  const pincode = pick(PINCODES);
  const placed = await call("order", "POST", "/v1/orders", {
    token: c.token,
    clientIp: c.ip,
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: {
      pincode,
      shipTo: { recipientName: "Load Test", phone: "9811122233", line1: "1, Test Street" },
      lines: [{ variantId: pick(variants).id, quantity: 1 }],
    },
  });
  // Sold out, past cutoff or not deliverable to this pincode are correct answers, not failures.
  if (placed.status === 409 || placed.status === 422) {
    outcomes.unavailable++;
    return;
  }
  if (placed.status !== 201 && placed.status !== 200) return;
  outcomes.placed++;
  const paid = await call("pay", "POST", `/v1/dev/orders/${placed.data.order.id}/pay`, {
    token: c.token,
    clientIp: c.ip,
  });
  if (paid.status === 200) outcomes.paid++;
}

function weighted() {
  let r = Math.random();
  for (const [name, w] of MIX) {
    r -= w;
    if (r <= 0) return name;
  }
  return MIX[0][0];
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const inflight = new Set();
const track = (p) => {
  inflight.add(p);
  p.finally(() => inflight.delete(p));
};
let peakInflight = 0;
const started = performance.now();
const end = started + DURATION_S * 1000;
let browseDue = started;
let orderDue = started;
const browseGap = 1000 / RPS;
const orderGap = 60_000 / ORDERS_PER_MIN;
while (performance.now() < end) {
  const now = performance.now();
  while (browseDue <= now) {
    track(scenarios[weighted()]());
    browseDue += browseGap;
  }
  while (orderDue <= now) {
    track(order());
    orderDue += orderGap;
  }
  peakInflight = Math.max(peakInflight, inflight.size);
  await new Promise((r) => setTimeout(r, 5));
}
await Promise.allSettled([...inflight]);
const elapsed = (performance.now() - started) / 1000;

// ─── Report ──────────────────────────────────────────────────────────────────

const pct = (xs, p) => xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] ?? 0;
const rows = [];
let total = 0;
let failed = 0;
for (const [name, s] of stats) {
  const xs = [...s.latencies].sort((a, b) => a - b);
  const errors = Object.entries(s.statuses)
    .filter(([code]) => code === "0" || Number(code) >= 500 || code === "429")
    .reduce((n, [, c]) => n + c, 0);
  total += xs.length;
  failed += errors;
  rows.push({
    scenario: name,
    requests: xs.length,
    p50: Math.round(pct(xs, 50)),
    p95: Math.round(pct(xs, 95)),
    p99: Math.round(pct(xs, 99)),
    max: Math.round(xs.at(-1) ?? 0),
    errors,
    statuses: JSON.stringify(s.statuses),
    budgetP95: THRESHOLDS[name],
  });
}
console.table(rows);
const errorRate = total ? failed / total : 0;
console.log(
  `${total} requests in ${elapsed.toFixed(0)}s (${(total / elapsed).toFixed(1)}/s), peak ${peakInflight} in flight, ` +
    `error rate ${(errorRate * 100).toFixed(2)}%. Orders: ${outcomes.placed} placed, ${outcomes.paid} paid, ${outcomes.unavailable} unavailable.`,
);
const breaches = [
  ...rows
    .filter((r) => r.budgetP95 && r.p95 > r.budgetP95)
    .map((r) => `${r.scenario} p95 ${r.p95}ms > ${r.budgetP95}ms`),
  ...(errorRate > THRESHOLDS.errorRate ? [`error rate ${(errorRate * 100).toFixed(2)}%`] : []),
];
if (args.out) {
  writeFileSync(
    args.out,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        rps: RPS,
        ordersPerMin: ORDERS_PER_MIN,
        elapsed,
        rows,
        outcomes,
        errorRate,
        breaches,
      },
      null,
      2,
    ),
  );
}
if (breaches.length) {
  console.error(`FAILED: ${breaches.join("; ")}`);
  process.exit(1);
}
console.log("PASSED all thresholds.");
