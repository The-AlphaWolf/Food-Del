import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestApi } from "./helpers";

let h: Awaited<ReturnType<typeof createTestApi>>;
beforeAll(async () => {
  h = await createTestApi(new Date("2026-10-12T05:30:00Z"));
});
afterAll(async () => {
  await h?.t.close();
});

it("reports healthy when the database answers", async () => {
  const r = await h.call("GET", "/v1/health");
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ ok: true });
  expect(r.headers.get("x-api-version")).toBe("1.0.0");
});

it("tells uptime monitors whether queued work is being processed", async () => {
  const ok = await h.call("GET", "/v1/health/ready");
  expect(ok.status).toBe(200);
  expect(ok.body).toEqual({ ready: true });
  expect(ok.headers.get("cache-control")).toBe("no-store");

  // The outbox job ran once, then the cron stopped for half an hour.
  await h.t.core.runJob("process-outbox");
  h.t.clock.set(new Date(h.t.clock.now.getTime() + 30 * 60_000));
  const stalled = await h.call("GET", "/v1/health/ready");
  expect(stalled.status).toBe(503);
  expect(stalled.body).toEqual({ ready: false });
});

it("shows ops the job schedule and queue", async () => {
  const anon = await h.call("GET", "/v1/ops/health");
  expect(anon.status).toBe(401);
  const ops = await h.call<{ status: string; jobs: { job: string; health: string }[] }>(
    "GET",
    "/v1/ops/health",
    { token: await h.login("9900000002") },
  );
  expect(ops.status).toBe(200);
  expect(ops.body.status).toBe("DEGRADED");
  expect(ops.body.jobs.find((j) => j.job === "process-outbox")?.health).toBe("LATE");
  expect(ops.body.jobs.find((j) => j.job === "housekeeping")?.health).toBe("NEVER_RUN");
});

it("answers a malformed body with 400, not a server error", async () => {
  const res = await h.api.request("/api/v1/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"pincode": "5600',
  });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { code: string }).code).toBe("MALFORMED_REQUEST");
});
