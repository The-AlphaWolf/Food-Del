/**
 * In-process payment provider for development and tests. Orders are "paid" by calling the dev
 * capture endpoint, which feeds `fakeCaptureWebhook()` through the normal webhook path.
 */
import { createHmac } from "node:crypto";
import type {
  CheckoutConfig,
  CreatePaymentOrderInput,
  PaymentOrder,
  PaymentProvider,
  PaymentWebhookEvent,
  RefundResult,
} from "./types";

const FAKE_SECRET = "fake-payments-are-not-secret";

let counter = 0;
const nextId = (prefix: string) =>
  `${prefix}_fake${Date.now().toString(36)}${(++counter).toString(36).padStart(4, "0")}`;

export class FakePaymentProvider implements PaymentProvider {
  readonly name = "FAKE" as const;
  readonly refunds: { providerPaymentId: string; amountPaise: number }[] = [];
  readonly transfers: { id: string; accountRef: string; amountPaise: number; released: boolean }[] =
    [];

  async createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder> {
    const providerOrderId = nextId("order");
    return { providerOrderId, checkout: this.checkoutFor(providerOrderId, input.amountPaise) };
  }

  checkoutFor(providerOrderId: string, amountPaise: number): CheckoutConfig {
    return { kind: "fake", providerOrderId, amountPaise, currency: "INR" };
  }

  verifyCheckoutSignature(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): boolean {
    return (
      input.signature ===
      FakePaymentProvider.sign(`${input.providerOrderId}|${input.providerPaymentId}`)
    );
  }

  verifyWebhook(rawBody: string, signature: string | null): boolean {
    return signature === FakePaymentProvider.sign(rawBody);
  }

  parseWebhook(rawBody: string): PaymentWebhookEvent | null {
    return JSON.parse(rawBody) as PaymentWebhookEvent;
  }

  async refund(input: { providerPaymentId: string; amountPaise: number }): Promise<RefundResult> {
    this.refunds.push(input);
    return { providerRefundId: nextId("rfnd"), status: "PROCESSED" };
  }

  async transferToVendor(input: { accountRef: string; amountPaise: number }): Promise<string> {
    const id = nextId("trf");
    this.transfers.push({
      id,
      accountRef: input.accountRef,
      amountPaise: input.amountPaise,
      released: false,
    });
    return id;
  }

  async releaseTransfer(providerTransferId: string): Promise<void> {
    const t = this.transfers.find((x) => x.id === providerTransferId);
    if (t) t.released = true;
  }

  static sign(payload: string): string {
    return createHmac("sha256", FAKE_SECRET).update(payload).digest("hex");
  }

  /** A signed capture webhook, exactly as the provider would send it. */
  static captureWebhook(
    providerOrderId: string,
    amountPaise: number,
  ): { body: string; signature: string } {
    const event: PaymentWebhookEvent = {
      type: "payment.captured",
      providerOrderId,
      providerPaymentId: nextId("pay"),
      amountPaise,
      method: "upi",
    };
    const body = JSON.stringify(event);
    return { body, signature: FakePaymentProvider.sign(body) };
  }
}
