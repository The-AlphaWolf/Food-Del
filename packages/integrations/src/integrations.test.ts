import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  mapShiprocketStatus,
  parseShiprocketTime,
  ShiprocketProvider,
} from "./logistics/shiprocket";
import { FakePaymentProvider } from "./payments/fake";
import { RazorpayProvider } from "./payments/razorpay";

const razorpay = new RazorpayProvider({
  keyId: "rzp_test_key",
  keySecret: "secret",
  webhookSecret: "whsec",
  brandName: "Food-Del",
});

describe("Razorpay signatures", () => {
  it("verifies checkout signatures over order_id|payment_id", () => {
    const signature = createHmac("sha256", "secret").update("order_1|pay_1").digest("hex");
    expect(
      razorpay.verifyCheckoutSignature({
        providerOrderId: "order_1",
        providerPaymentId: "pay_1",
        signature,
      }),
    ).toBe(true);
    expect(
      razorpay.verifyCheckoutSignature({
        providerOrderId: "order_1",
        providerPaymentId: "pay_2",
        signature,
      }),
    ).toBe(false);
  });

  it("verifies webhook bodies and parses captures", () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: { entity: { id: "pay_9", order_id: "order_9", amount: 123400, method: "upi" } },
      },
    });
    const sig = createHmac("sha256", "whsec").update(body).digest("hex");
    expect(razorpay.verifyWebhook(body, sig)).toBe(true);
    expect(razorpay.verifyWebhook(`${body} `, sig)).toBe(false);
    expect(razorpay.verifyWebhook(body, null)).toBe(false);
    expect(razorpay.parseWebhook(body)).toEqual({
      type: "payment.captured",
      providerOrderId: "order_9",
      providerPaymentId: "pay_9",
      amountPaise: 123400,
      method: "upi",
    });
  });

  it("creates orders through the Orders API with basic auth", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const provider = new RazorpayProvider({
      keyId: "k",
      keySecret: "s",
      webhookSecret: "w",
      brandName: "Food-Del",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init! });
        return new Response(JSON.stringify({ id: "order_abc", amount: 9900 }), { status: 200 });
      },
    });
    const order = await provider.createOrder({
      amountPaise: 9900,
      receipt: "FD-1",
      description: "x",
    });
    expect(order.providerOrderId).toBe("order_abc");
    expect(calls[0]!.url).toBe("https://api.razorpay.com/v1/orders");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("k:s").toString("base64")}`,
    );
  });
});

describe("Fake payments", () => {
  it("produces webhooks that pass its own verification", () => {
    const p = new FakePaymentProvider();
    const { body, signature } = FakePaymentProvider.captureWebhook("order_x", 500);
    expect(p.verifyWebhook(body, signature)).toBe(true);
    expect(p.parseWebhook(body)).toMatchObject({
      type: "payment.captured",
      providerOrderId: "order_x",
    });
  });
});

describe("Shiprocket mapping", () => {
  it("maps carrier statuses onto the shipment state machine", () => {
    expect(mapShiprocketStatus("PICKED UP")).toBe("PICKED_UP");
    expect(mapShiprocketStatus("in transit")).toBe("IN_TRANSIT_INTERCITY");
    expect(mapShiprocketStatus("REACHED AT DESTINATION HUB")).toBe("AT_DESTINATION_HUB");
    expect(mapShiprocketStatus("UNDELIVERED-1st Attempt")).toBe("DELIVERY_ATTEMPT_FAILED");
    expect(mapShiprocketStatus("MANIFEST GENERATED")).toBeNull();
  });

  it("reads IST timestamps", () => {
    expect(parseShiprocketTime("23 10 2026 11:43:52")?.toISOString()).toBe(
      "2026-10-23T06:13:52.000Z",
    );
    expect(parseShiprocketTime("2026-10-23 11:43:52")?.toISOString()).toBe(
      "2026-10-23T06:13:52.000Z",
    );
  });

  it("checks the webhook token and builds idempotent events", () => {
    const sr = new ShiprocketProvider({
      email: "e",
      password: "p",
      webhookToken: "tok",
      courierIds: {},
    });
    expect(sr.verifyWebhook(new Headers({ "x-api-key": "tok" }), "")).toBe(true);
    expect(sr.verifyWebhook(new Headers({ "x-api-key": "nope" }), "")).toBe(false);
    const body = JSON.stringify({
      awb: 1234,
      current_status: "OUT FOR DELIVERY",
      current_timestamp: "23 10 2026 09:00:00",
      etd: "2026-10-23 18:00:00",
    });
    const [e] = sr.parseWebhook(body);
    expect(e).toMatchObject({ awbNumber: "1234", status: "OUT_FOR_LOCAL_DELIVERY" });
    expect(sr.parseWebhook(body)[0]!.externalEventId).toBe(e!.externalEventId);
    expect(e!.etaAt?.toISOString()).toBe("2026-10-23T12:30:00.000Z");
  });
});
