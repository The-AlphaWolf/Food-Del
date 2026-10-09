import { createTestCore, type TestCore } from "@food-del/core/testing";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createApi } from "../src/app";

let t: TestCore;
beforeAll(async () => {
  t = await createTestCore({ now: new Date("2026-10-12T05:30:00Z") });
});
afterAll(async () => {
  await t?.close();
});

it("reports healthy when the database answers", async () => {
  const res = await createApi(t.core).request("/api/v1/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true });
});
