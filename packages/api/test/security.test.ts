import { randomUUID } from "node:crypto";
import { DEV_OPS } from "@food-del/db/seed";
import { atIst } from "@food-del/domain";
import type { Problem } from "@food-del/domain/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi } from "./helpers";

let h: Awaited<ReturnType<typeof createTestApi>>;
let customer: string;

beforeAll(async () => {
  h = await createTestApi(atIst("2026-10-12", "11:00"), {
    rateLimits: { pincodes: { limit: 2, windowSeconds: 60 } },
  });
  customer = await h.login("98450 54321");
});

afterAll(async () => {
  await h?.t.close();
});

type Audience = "staff" | "kitchen" | "signed-in" | "public";

function audienceOf(path: string): Audience | null {
  if (path.includes("/webhooks/") || path.includes("/auth/")) return null;
  if (path.startsWith("/api/v1/ops/")) return "staff";
  if (path.startsWith("/api/v1/vendor/")) return "kitchen";
  if (/^\/api\/v1\/(me|orders|shipments)(\/|$)/.test(path)) return "signed-in";
  return "public";
}

/** A request the route can accept: real-looking params, so only access control can refuse it. */
function concrete(path: string): string {
  return path
    .replace("{slug}", "kaju-katli")
    .replace("{pincode}", "560038")
    .replace("{date}", "2026-10-13")
    .replace(/\{[^}]+\}/g, () => randomUUID());
}

describe("authorization matrix", () => {
  it("refuses every protected route to the wrong audience, before reading any input", async () => {
    const doc = await h.call<{ paths: Record<string, Record<string, unknown>> }>(
      "GET",
      "/v1/openapi.json",
    );
    const checked: string[] = [];
    for (const [path, ops] of Object.entries(doc.body.paths)) {
      const audience = audienceOf(path);
      if (!audience) continue;
      for (const method of Object.keys(ops)) {
        const url = concrete(path).replace(/^\/api/, "");
        // Deliberately invalid bodies: a guard must answer before validation does.
        const body = method === "get" ? undefined : { nonsense: true };
        const anon = await h.call<Problem>(method.toUpperCase(), url, { body });
        const asCustomer = await h.call<Problem>(method.toUpperCase(), url, {
          body,
          token: customer,
        });
        const label = `${method.toUpperCase()} ${path}`;
        if (audience === "public") {
          expect([401, 403], label).not.toContain(anon.status);
        } else {
          expect(anon.status, `${label} anonymous`).toBe(401);
          if (audience === "signed-in") {
            expect([401, 403], `${label} customer`).not.toContain(asCustomer.status);
          } else {
            expect(asCustomer.status, `${label} customer`).toBe(403);
          }
        }
        checked.push(label);
      }
    }
    // Guard against the matrix silently checking nothing.
    expect(checked.length).toBeGreaterThan(50);
  });

  it("runs scheduled jobs only for the cron secret or ops", async () => {
    expect((await h.call("POST", "/v1/jobs/expire-holds")).status).toBe(401);
    expect((await h.call("POST", "/v1/jobs/expire-holds", { token: customer })).status).toBe(401);
    expect((await h.call("POST", "/v1/dev/tick")).status).toBe(401);
    expect(
      (
        await h.call("POST", "/v1/jobs/expire-holds", {
          headers: { Authorization: "Bearer cron-secret!" },
        })
      ).status,
    ).toBe(401);
    const ok = await h.call("POST", "/v1/jobs/expire-holds", {
      headers: { Authorization: "Bearer cron-secret" },
    });
    expect(ok.status).toBe(200);
    const ops = await h.login(DEV_OPS.phone);
    expect((await h.call("POST", "/v1/dev/tick", { token: ops })).status).toBe(200);
  });
});

describe("cookie sessions", () => {
  it("refuse writes from other sites but allow our own pages", async () => {
    const cookie = `fd_session=${customer}`;
    const evil = await h.call<Problem>("POST", "/v1/me/addresses", {
      body: {},
      headers: { cookie, origin: "https://evil.example", host: "food-del.in" },
    });
    expect(evil.status).toBe(403);
    expect(evil.body.code).toBe("CROSS_SITE_REQUEST");
    const fetchMeta = await h.call<Problem>("POST", "/v1/me/addresses", {
      body: {},
      headers: { cookie, "sec-fetch-site": "cross-site" },
    });
    expect(fetchMeta.status).toBe(403);
    const ours = await h.call<Problem>("POST", "/v1/me/addresses", {
      body: {},
      headers: { cookie, origin: "https://food-del.in", host: "food-del.in" },
    });
    expect(ours.status).toBe(422);
    // Reads, and bearer-token clients, are unaffected.
    const read = await h.call("GET", "/v1/me", {
      headers: { cookie, origin: "https://evil.example", host: "food-del.in" },
    });
    expect(read.status).toBe(200);
  });
});

describe("rate limits", () => {
  it("answers 429 with Retry-After once a caller exceeds the window", async () => {
    const ip = { "x-real-ip": "203.0.113.7" };
    const first = await h.call("GET", "/v1/pincodes/560038", { headers: ip });
    expect(first.status).toBe(200);
    expect(first.headers.get("ratelimit-remaining")).toBe("1");
    expect((await h.call("GET", "/v1/pincodes/560038", { headers: ip })).status).toBe(200);
    const third = await h.call<Problem>("GET", "/v1/pincodes/560038", { headers: ip });
    expect(third.status).toBe(429);
    expect(third.body.code).toBe("RATE_LIMITED");
    expect(Number(third.headers.get("retry-after"))).toBeGreaterThan(0);
    // Someone else isn't affected.
    expect(
      (await h.call("GET", "/v1/pincodes/560038", { headers: { "x-real-ip": "203.0.113.8" } }))
        .status,
    ).toBe(200);
  });

  it("prunes old counters in nightly housekeeping", async () => {
    h.t.clock.advanceHours(30);
    const r = await h.call<{ processed: number }>("POST", "/v1/jobs/housekeeping", {
      headers: { Authorization: "Bearer cron-secret" },
    });
    expect(r.body.processed).toBeGreaterThanOrEqual(2);
  });
});
