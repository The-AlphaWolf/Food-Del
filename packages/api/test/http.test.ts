import { DEV_OPS, devVendorOwner, VENDOR_SEED } from "@food-del/db/seed";
import { atIst } from "@food-del/domain";
import type {
  Availability,
  ItemCard,
  ItemDetail,
  KitchenDetail,
  Me,
  OnboardingOptions,
  OrderDetail,
  PayoutRow,
  PayoutSummary,
  PlaceOrderResponse,
  Problem,
  Quote,
  Route,
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

  it("shows ops the kitchen's payout once delivered, with a CSV statement", async () => {
    const detail = await h.call<OrderDetail>("GET", `/v1/orders/${order.id}`, {
      token: customerToken,
    });
    const awb = detail.body.shipments[0]!.awbNumber!;
    await h.call("POST", "/v1/webhooks/carriers/fake", {
      body: FakeCarrier.event(awb, "DELIVERED", atIst("2026-10-14", "12:00")),
      headers: { "x-api-key": FAKE_CARRIER_TOKEN },
    });
    const denied = await h.call<Problem>("GET", "/v1/ops/payouts", { token: customerToken });
    expect(denied.status).toBe(403);

    const opsToken = await h.login(DEV_OPS.phone);
    const list = await h.call<PayoutRow[]>(
      "GET",
      `/v1/ops/payouts?state=NEEDS_ACTION&q=${order.orderNumber}`,
      { token: opsToken },
    );
    expect(list.status).toBe(200);
    expect(list.body).toEqual([
      expect.objectContaining({ orderNumber: order.orderNumber, state: "NEEDS_PAYOUT_ACCOUNT" }),
    ]);
    const payout = list.body[0]!;

    const summary = await h.call<PayoutSummary>("GET", "/v1/ops/payouts/summary?days=7", {
      token: opsToken,
    });
    expect(summary.body.needsAction.count).toBeGreaterThanOrEqual(1);

    const tooShort = await h.call<Problem>("POST", `/v1/ops/payouts/${payout.id}/hold`, {
      token: opsToken,
      body: { reason: "x" },
    });
    expect(tooShort.status).toBe(422);
    const noAccount = await h.call<Problem>("POST", `/v1/ops/payouts/${payout.id}/retry`, {
      token: opsToken,
      body: {},
    });
    expect(noAccount.status).toBe(409);
    expect(noAccount.body.code).toBe("NO_PAYOUT_ACCOUNT");

    const res = await h.api.request("/api/v1/ops/payouts/statement?from=2026-10-01&to=2026-10-31", {
      headers: { Authorization: `Bearer ${opsToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain(
      "payouts-2026-10-01-to-2026-10-31.csv",
    );
    expect(await res.text()).toContain(order.orderNumber);
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
    // The earlier journey's parcel is either still moving or already delivered.
    const { inFlight = 0, deliveredLast7d = 0 } = r.body.counts;
    expect(inFlight + deliveredLast7d).toBeGreaterThanOrEqual(1);
  });
});

describe("onboarding", () => {
  it("creates a kitchen, validates input and gates go-live over HTTP", async () => {
    const options = await h.call<OnboardingOptions>("GET", "/v1/ops/onboarding/options", {
      token: customerToken,
    });
    expect(options.status).toBe(403);
    const opsToken = await h.login(DEV_OPS.phone);
    const { body: opts } = await h.call<OnboardingOptions>("GET", "/v1/ops/onboarding/options", {
      token: opsToken,
    });
    const kolkata = opts.cities.find((c) => c.slug === "kolkata")!;

    const bad = await h.call<Problem>("POST", "/v1/ops/kitchens", {
      token: opsToken,
      body: { name: "X", cityId: kolkata.id, fssaiLicenseNo: "123" },
    });
    expect(bad.status).toBe(422);
    expect(bad.headers.get("content-type")).toContain("application/problem+json");

    const created = await h.call<KitchenDetail>("POST", "/v1/ops/kitchens", {
      token: opsToken,
      body: {
        name: "Girish Chandra Dey & Nakur Chandra Nandy",
        cityId: kolkata.id,
        pickupPincode: "700006",
        pickupAddress: {
          line1: "56, Ramdulal Sarkar Street",
          contactName: "Desk",
          contactPhone: "9830012345",
        },
        fssaiLicenseNo: "12819000000456",
        fssaiValidUntil: "2028-06-30",
        orderCutoffLocal: "18:00",
        prepLeadDays: 1,
        prepStartLocal: "06:00",
        readyForPickupLocal: "12:00",
        dispatchWeekdays: 63,
        dailyShipmentCap: 40,
        commissionBps: 2000,
        owner: { name: "Owner", phone: "9830098300" },
      },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      slug: "girish-chandra-dey-and-nakur-chandra-nandy",
      status: "ONBOARDING",
    });

    // A malformed id is the caller's mistake (422), never a database error (500).
    const malformed = await h.call<Problem>("GET", "/v1/ops/kitchens/not-a-uuid", {
      token: opsToken,
    });
    expect(malformed.status).toBe(422);

    const live = await h.call<Problem>("PATCH", `/v1/ops/vendors/${created.body.id}`, {
      token: opsToken,
      body: { status: "ACTIVE" },
    });
    expect(live.status).toBe(409);
    expect(live.body.code).toBe("KITCHEN_NOT_READY");

    const sameCity = await h.call<Problem>("PUT", "/v1/ops/routes", {
      token: opsToken,
      body: {
        originCityId: kolkata.id,
        destinationCityId: kolkata.id,
        carrierCode: "bluedart",
        mode: "AIR_EXPRESS",
        transitHoursP50: 24,
        transitHoursP90: 20,
        pickupCutoffLocal: "15:00",
        deliversSunday: false,
        acceptsDryIce: false,
        rateZone: "METRO",
        isActive: true,
      },
    });
    expect(sameCity.status).toBe(422);
    const routes = await h.call<Route[]>("GET", `/v1/ops/routes?originCityId=${kolkata.id}`, {
      token: opsToken,
    });
    expect(routes.status).toBe(200);
    expect(routes.body.length).toBeGreaterThan(0);
    expect(routes.body.every((r) => r.origin.slug === "kolkata")).toBe(true);
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
      expect.arrayContaining([
        "Quote",
        "OrderDetail",
        "ItemCard",
        "KitchenDetail",
        "Route",
        "PayoutRow",
        "PayoutSummary",
      ]),
    );
  });

  it("signs fake webhooks the same way as the dev pay endpoint", () => {
    const { body, signature } = FakePaymentProvider.captureWebhook("order_x", 100);
    expect(h.t.payments.verifyWebhook(body, signature)).toBe(true);
  });
});
