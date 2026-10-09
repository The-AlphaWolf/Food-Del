import { afterAll, beforeAll, expect, it } from "vitest";
import { createDemoBackend, type DemoBackend } from "./backend";

let b: DemoBackend;
const base = "/Food-Del/api";
const call = async (method: string, path: string, body?: unknown, token?: string) => {
  const res = await b.api.request(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};
const login = async (phone: string) => {
  await call("POST", "/v1/auth/otp", { phone });
  return (await call("POST", "/v1/auth/verify", { phone, code: "123456" })).body.token as string;
};

beforeAll(async () => {
  b = await createDemoBackend({
    basePath: base,
    appUrl: "https://example.test/Food-Del",
    logger: { info() {}, warn() {}, error: (m, d) => console.error(m, d?.error) },
  });
}, 120_000);
afterAll(async () => {
  await b?.client.close();
});

it("serves the catalogue from Postgres running in WebAssembly", async () => {
  const items = await call("GET", "/v1/items?pincode=560038&limit=50");
  expect(items.status).toBe(200);
  expect(items.body.length).toBeGreaterThan(20);
  expect(items.body.some((i: { delivery: { available: boolean } }) => i.delivery.available)).toBe(
    true,
  );
});

it("takes an order from checkout to the ops console", async () => {
  const customer = await login("9811122233");
  const katli = (await call("GET", "/v1/items/kaju-katli")).body;
  const placed = await call(
    "POST",
    "/v1/orders",
    {
      pincode: "560038",
      shipTo: { recipientName: "Ananya Rao", phone: "9876543210", line1: "12, 4th Cross" },
      lines: [{ variantId: katli.variants[0].id, quantity: 1 }],
    },
    customer,
  );
  expect(placed.status).toBe(201);
  const paid = await call("POST", `/v1/dev/orders/${placed.body.order.id}/pay`, {}, customer);
  expect(paid.status).toBe(200);
  await b.tick();

  const ops = await login("9900000002");
  const overview = await call("GET", "/v1/ops/overview", undefined, ops);
  expect(overview.status).toBe(200);
  const health = await call("GET", "/v1/ops/health", undefined, ops);
  expect(health.status).toBe(200);
  expect(health.body.jobs.find((j: { job: string }) => j.job === "process-outbox").health).toBe(
    "OK",
  );
  const routes = await call("GET", "/v1/ops/routes", undefined, ops);
  expect(routes.status).toBe(200);
  expect(routes.body.length).toBeGreaterThan(0);
});
