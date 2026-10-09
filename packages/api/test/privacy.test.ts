import { PRIVACY_NOTICE_VERSION } from "@food-del/domain";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestApi } from "./helpers";

let h: Awaited<ReturnType<typeof createTestApi>>;
beforeAll(async () => {
  h = await createTestApi(new Date("2026-10-12T05:30:00Z"));
});
afterAll(async () => {
  await h?.t.close();
});

it("records the notice, exports data and deletes the account", async () => {
  const token = await h.login("9833344455");

  const ack = await h.call<{ privacyNoticeAcknowledged: string }>("POST", "/v1/me/privacy-notice", {
    token,
    body: { version: PRIVACY_NOTICE_VERSION },
  });
  expect(ack.status).toBe(200);
  expect(ack.body.privacyNoticeAcknowledged).toBe(PRIVACY_NOTICE_VERSION);

  const data = await h.call<{ profile: { phone: string } }>("GET", "/v1/me/export", { token });
  expect(data.status).toBe(200);
  expect(data.body.profile.phone).toBe("+919833344455");
  expect(data.headers.get("content-disposition")).toMatch(
    /^attachment; filename="food-del-my-data-\d{4}-\d{2}-\d{2}\.json"$/,
  );
  expect(data.headers.get("cache-control")).toBe("no-store");

  const unconfirmed = await h.call("DELETE", "/v1/me", { token, body: {} });
  expect(unconfirmed.status).toBe(422);

  const deleted = await h.call("DELETE", "/v1/me", { token, body: { confirm: "DELETE" } });
  expect(deleted.status).toBe(204);

  // The old session no longer opens anything.
  expect((await h.call("GET", "/v1/me", { token })).status).toBe(401);
});

it("explains why a kitchen account can't delete itself", async () => {
  const token = await h.login("9900000105");
  const r = await h.call<{ code: string }>("DELETE", "/v1/me", {
    token,
    body: { confirm: "DELETE" },
  });
  expect(r.status).toBe(409);
  expect(r.body.code).toBe("ACCOUNT_HAS_ROLES");
});
