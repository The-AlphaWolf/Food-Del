import { DEV_OPS, devVendorOwner, VENDOR_SEED } from "@food-del/db/seed";
import { atIst } from "@food-del/domain";
import type {
  Availability,
  ItemCard,
  ItemDetail,
  Me,
  OrderDetail,
  PlaceOrderResponse,
  Problem,
  Quote,
  VendorDay,
} from "@food-del/domain/contracts";
import { FAKE_CARRIER_TOKEN, FakeCarrier, FakePaymentProvider } from "@food-del/integrations";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi } from "./helpers";

let h: Awaited<ReturnType<typeof createTestApi>>;
let customerToken: string;
let katliVariant: string;

beforeAll(async () => {
  h = await createTestApi(atIst("2026-10-12", "11:00"));
  customerToken = await h.login("98450 12345");
  const item = await h.call<ItemDetail>("GET", "/v1/items/kaju-katli");
  katliVariant = item.body.variants[0]!.id;
});

afterAll(async () => {
  await h?.t.close();
});

describe("public catalogue", () => {
  it("lists items with delivery estimates for a pincode", async () => {
    const r = await h.call<ItemCard[]>("GET", "/v1/items?pincode=560038&origin=delhi-ncr");
    expect(r.status).toBe(200);
    expect(r.body.every((i) => i.vendor.city.slug === "delhi-ncr")).toBe(true);
    expect(r.body.find((i) => i.slug === "kaju-katli")?.delivery).toMatchObject({
      available: true,
    });
  });

  it("validates input with problem+json", async () => {
    const r = await h.call<Problem>("GET", "/v1/items?pincode=12");
    expect(r.status).toBe(422);
    expect(r.headers.get("content-type")).toContain("application/problem+json");
    expect(r.body.code).toBe("VALIDATION_FAILED");
  });

  it("returns 404 problems for unknown items", async () => {
    const r = await h.call<Problem>("GET", "/v1/items/not-a-sweet");
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("NOT_FOUND");
  });

  it("serves the delivery calendar and quotes", async () => {
    const a = await h.call<Availability>(
      "GET",
      `/v1/availability?pincode=560038&variantId=${katliVariant}&days=7`,
    );
    expect(a.status).toBe(200);
    expect(a.body.days).toHaveLength(7);
    const q = await h.call<Quote>("POST", "/v1/quotes", {
      body: { pincode: "560038", lines: [{ variantId: katliVariant, quantity: 1 }] },
    });
    expect(q.status).toBe(200);
    expect(q.body.totals.isComplete).toBe(true);
  });
});

describe("auth", () => {
  it("rejects anonymous access to orders", async () => {
    const r = await h.call<Problem>("GET", "/v1/orders");
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a wrong OTP and accepts the dev code", async () => {
    const bad = await h.call<Problem>("POST", "/v1/auth/verify", {
      body: { phone: "9845012345", code: "000000" },
    });
    expect(bad.body.code).toBe("INVALID_OTP");
    const me = await h.call<Me>("GET", "/v1/me", { token: customerToken });
    expect(me.body).toMatchObject({ phone: "+919845012345", roles: ["CUSTOMER"] });
  });

  it("sets an httpOnly session cookie for the web app", async () => {
    const r = await h.api.request("/api/v1/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "9845012345", code: "123456" }),
    });
    const cookie = r.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("fd_session=");
    expect(cookie).toContain("HttpOnly");
    const me = await h.api.request("/api/v1/me", { headers: { cookie: cookie.split(";")[0]! } });
    expect(me.status).toBe(200);
  });

  it("ignores tampered tokens", async () => {
    const r = await h.call<Problem>("GET", "/v1/me", {
      token: `${customerToken.slice(0, -4)}abcd`,
    });
    expect(r.status).toBe(401);
  });
});

describe("order to doorstep over HTTP", () => {
  let order: OrderDetail;

  it("places an order idempotently", async () => {
    const req = {
      pincode: "560038",
      shipTo: {
        recipientName: "Kavya Iyer",
        phone: "9900112233",
        line1: "221B, 12th Main, HAL 2nd Stage",
      },
      lines: [{ variantId: katliVariant, quantity: 1 }],
    };
    const a = await h.call<PlaceOrderResponse>("POST", "/v1/orders", {
      token: customerToken,
      body: req,
      headers: { "Idempotency-Key": "checkout-attempt-0001" },
    });
    expect(a.status).toBe(201);
    const b = await h.call<PlaceOrderResponse>("POST", "/v1/orders", {
      token: customerToken,
      body: req,
      headers: { "Idempotency-Key": "checkout-attempt-0001" },
    });
    expect(b.body.order.id).toBe(a.body.order.id);
    order = a.body.order;
  });

  it("pays through the signed webhook and confirms", async () => {
    const bad = await h.call<Problem>("POST", "/v1/webhooks/payments", {
      body: "{}",
      headers: { "x-signature": "nope" },
    });
    expect(bad.status).toBe(401);
    const paid = await h.call<OrderDetail>("POST", `/v1/dev/orders/${order.id}/pay`, {
      token: customerToken,
    });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("CONFIRMED");
    // A paid order has nothing left to pay.
    const again = await h.call<PlaceOrderResponse>("POST", `/v1/orders/${order.id}/payment`, {
      token: customerToken,
    });
    expect(again.body.checkout).toBeNull();
  });

  it("runs the cutoff job via the cron secret", async () => {
    h.t.clock.set(atIst("2026-10-12", "18:01"));
    const denied = await h.call<Problem>("POST", "/v1/jobs/lock-batches");
    expect(denied.status).toBe(401);
    const r = await h.call<{ processed: number }>("GET", "/v1/jobs/lock-batches", {
      headers: { Authorization: "Bearer cron-secret" },
    });
    expect(r.status).toBe(200);
    expect(r.body.processed).toBeGreaterThanOrEqual(1);
  });

  it("lets the kitchen pack and books the courier", async () => {
    const slug = "chandni-chowk-halwai";
    const owner = devVendorOwner(
      VENDOR_SEED.findIndex((v) => v.slug === slug),
      slug,
    );
    const vendorToken = await h.login(owner.phone);
    const kitchens = await h.call<{ id: string }[]>("GET", "/v1/vendor/kitchens", {
      token: vendorToken,
    });
    expect(kitchens.body).toHaveLength(1);
    const day = await h.call<VendorDay>(
      "GET",
      `/v1/vendor/${kitchens.body[0]!.id}/days/2026-10-13`,
      { token: vendorToken },
    );
    const parcel = day.body.shipments.find((s) => s.orderNumber === order.orderNumber)!;
    expect(parcel.canPack).toBe(true);

    const customerTry = await h.call<Problem>("POST", `/v1/vendor/shipments/${parcel.id}/pack`, {
      token: customerToken,
      body: {},
    });
    expect(customerTry.status).toBe(403);

    h.t.clock.set(atIst("2026-10-13", "11:30"));
    const packed = await h.call<{ status: string }>(
      "POST",
      `/v1/vendor/shipments/${parcel.id}/pack`,
      {
        token: vendorToken,
        body: {},
      },
    );
    expect(packed.body.status).toBe("PACKED_COLD_CHAIN");
    await h.call("POST", "/v1/dev/tick");
  });

  it("accepts courier webhooks only with the right token", async () => {
    const detail = await h.call<OrderDetail>("GET", `/v1/orders/${order.id}`, {
      token: customerToken,
    });
    const awb = detail.body.shipments[0]!.awbNumber!;
    expect(awb).toBeTruthy();
    const event = FakeCarrier.event(awb, "PICKED_UP", atIst("2026-10-13", "15:00"));
    const bad = await h.call("POST", "/v1/webhooks/carriers/fake", {
      body: event,
      headers: { "x-api-key": "wrong" },
    });
    expect(bad.status).toBe(401);
    const ok = await h.call<{ outcomes: string[] }>("POST", "/v1/webhooks/carriers/fake", {
      body: event,
      headers: { "x-api-key": FAKE_CARRIER_TOKEN },
    });
    expect(ok.body.outcomes).toEqual(["applied"]);
    const after = await h.call<OrderDetail>("GET", `/v1/orders/${order.id}`, {
      token: customerToken,
    });
    expect(after.body.shipments[0]!.status).toBe("PICKED_UP");
  });

  it("keeps other customers out of the order", async () => {
    const stranger = await h.login("9000000009");
    const r = await h.call<Problem>("GET", `/v1/orders/${order.id}`, { token: stranger });
    expect(r.status).toBe(404);
  });
});

describe("operations", () => {
  it("is for ops staff only", async () => {
    const denied = await h.call<Problem>("GET", "/v1/ops/overview", { token: customerToken });
    expect(denied.status).toBe(403);
    const opsToken = await h.login(DEV_OPS.phone);
    const r = await h.call<{ counts: Record<string, number> }>("GET", "/v1/ops/overview", {
      token: opsToken,
    });
    expect(r.status).toBe(200);
    expect(r.body.counts.inFlight).toBeGreaterThanOrEqual(1);
  });
});

describe("OpenAPI", () => {
  it("documents the contract with named components", async () => {
    const r = await h.call<{
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    }>("GET", "/v1/openapi.json");
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.paths)).toEqual(
      expect.arrayContaining(["/api/v1/quotes", "/api/v1/orders", "/api/v1/availability"]),
    );
    expect(Object.keys(r.body.components.schemas)).toEqual(
      expect.arrayContaining(["Quote", "OrderDetail", "ItemCard"]),
    );
  });

  it("signs fake webhooks the same way as the dev pay endpoint", () => {
    const { body, signature } = FakePaymentProvider.captureWebhook("order_x", 100);
    expect(h.t.payments.verifyWebhook(body, signature)).toBe(true);
  });
});
