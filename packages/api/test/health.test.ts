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
