/**
 * Razorpay: Orders API + Standard Checkout, webhooks, refunds and Route transfers for vendor
 * settlements held until delivery.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { requestJson } from "../http";
import type {
  CheckoutConfig,
  CreatePaymentOrderInput,
  PaymentOrder,
  PaymentProvider,
  PaymentWebhookEvent,
  RefundResult,
} from "./types";

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  brandName: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

interface RazorpayWebhook {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id: string;
        order_id: string;
        amount: number;
        method?: string;
        error_description?: string;
      };
    };
    refund?: { entity?: { id: string; payment_id: string; amount: number } };
  };
}

export class RazorpayProvider implements PaymentProvider {
  readonly name = "RAZORPAY" as const;
  private readonly base: string;
  private readonly auth: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: RazorpayConfig) {
    this.base = config.baseUrl ?? "https://api.razorpay.com/v1";
    this.auth = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`;
    this.fetchImpl = config.fetch ?? fetch;
  }

  private call<T>(path: string, method: "GET" | "POST" | "PATCH", body?: unknown): Promise<T> {
    return requestJson<T>(
      "razorpay",
      `${this.base}${path}`,
      { method, body, headers: { Authorization: this.auth } },
      this.fetchImpl,
    );
  }

  async createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder> {
    const order = await this.call<{ id: string; amount: number }>("/orders", "POST", {
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt,
      notes: input.notes ?? {},
    });
    return {
      providerOrderId: order.id,
      checkout: this.checkoutFor(order.id, order.amount, input.description),
    };
  }

  checkoutFor(providerOrderId: string, amountPaise: number, description: string): CheckoutConfig {
    return {
      kind: "razorpay",
      keyId: this.config.keyId,
      providerOrderId,
      amountPaise,
      currency: "INR",
      name: this.config.brandName,
      description,
    };
  }

  verifyCheckoutSignature(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): boolean {
    const expected = hmacHex(
      this.config.keySecret,
      `${input.providerOrderId}|${input.providerPaymentId}`,
    );
    return safeEqualHex(expected, input.signature);
  }

  verifyWebhook(rawBody: string, signature: string | null): boolean {
    if (!signature) return false;
    return safeEqualHex(hmacHex(this.config.webhookSecret, rawBody), signature);
  }

  parseWebhook(rawBody: string): PaymentWebhookEvent | null {
    const body = JSON.parse(rawBody) as RazorpayWebhook;
    const payment = body.payload?.payment?.entity;
    const refund = body.payload?.refund?.entity;
    switch (body.event) {
      case "payment.captured":
      case "order.paid":
        return payment
          ? {
              type: "payment.captured",
              providerOrderId: payment.order_id,
              providerPaymentId: payment.id,
              amountPaise: payment.amount,
              method: payment.method ?? null,
            }
          : null;
      case "payment.failed":
        return payment
          ? {
              type: "payment.failed",
              providerOrderId: payment.order_id,
              providerPaymentId: payment.id,
              reason: payment.error_description ?? null,
            }
          : null;
      case "refund.processed":
        return refund
          ? {
              type: "refund.processed",
              providerPaymentId: refund.payment_id,
              providerRefundId: refund.id,
              amountPaise: refund.amount,
            }
          : null;
      default:
        return null;
    }
  }

  async refund(input: {
    providerPaymentId: string;
    amountPaise: number;
    notes?: Record<string, string>;
  }): Promise<RefundResult> {
    const r = await this.call<{ id: string; status: string }>(
      `/payments/${encodeURIComponent(input.providerPaymentId)}/refund`,
      "POST",
      { amount: input.amountPaise, speed: "normal", notes: input.notes ?? {} },
    );
    return { providerRefundId: r.id, status: r.status === "processed" ? "PROCESSED" : "PENDING" };
  }

  async transferToVendor(input: {
    providerPaymentId: string;
    accountRef: string;
    amountPaise: number;
  }): Promise<string> {
    const r = await this.call<{ items: { id: string }[] }>(
      `/payments/${encodeURIComponent(input.providerPaymentId)}/transfers`,
      "POST",
      {
        transfers: [
          {
            account: input.accountRef,
            amount: input.amountPaise,
            currency: "INR",
            // No on_hold_until: Razorpay would settle on that date even if a claim is open.
            on_hold: true,
          },
        ],
      },
    );
    const id = r.items[0]?.id;
    if (!id) throw new Error("razorpay: transfer response had no items");
    return id;
  }

  async releaseTransfer(providerTransferId: string): Promise<void> {
    await this.call(`/transfers/${encodeURIComponent(providerTransferId)}`, "PATCH", {
      on_hold: false,
    });
  }

  async reverseTransfer(providerTransferId: string, amountPaise: number): Promise<string> {
    const r = await this.call<{ id: string }>(
      `/transfers/${encodeURIComponent(providerTransferId)}/reversals`,
      "POST",
      { amount: amountPaise },
    );
    return r.id;
  }
}
