import type { Paise } from "@food-del/domain";

export type PaymentProviderName = "RAZORPAY" | "FAKE";

/** What the client needs to open the payment sheet. */
export type CheckoutConfig =
  | {
      kind: "razorpay";
      keyId: string;
      providerOrderId: string;
      amountPaise: Paise;
      currency: "INR";
      name: string;
      description: string;
    }
  | {
      kind: "fake";
      providerOrderId: string;
      amountPaise: Paise;
      currency: "INR";
    };

export interface CreatePaymentOrderInput {
  amountPaise: Paise;
  /** Our order number; shown in the provider dashboard. */
  receipt: string;
  description: string;
  notes?: Record<string, string>;
}

export interface PaymentOrder {
  providerOrderId: string;
  checkout: CheckoutConfig;
}

export type PaymentWebhookEvent =
  | {
      type: "payment.captured";
      providerOrderId: string;
      providerPaymentId: string;
      amountPaise: Paise;
      method: string | null;
    }
  | {
      type: "payment.failed";
      providerOrderId: string;
      providerPaymentId: string;
      reason: string | null;
    }
  | {
      type: "refund.processed";
      providerPaymentId: string;
      providerRefundId: string;
      amountPaise: Paise;
    };

export interface RefundResult {
  providerRefundId: string;
  status: "PENDING" | "PROCESSED";
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder>;
  /** Checkout config for a provider order created earlier (idempotent retries). */
  checkoutFor(providerOrderId: string, amountPaise: Paise, description: string): CheckoutConfig;
  /** Signature the checkout widget returns on success. */
  verifyCheckoutSignature(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): boolean;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
  parseWebhook(rawBody: string): PaymentWebhookEvent | null;
  refund(input: {
    providerPaymentId: string;
    amountPaise: Paise;
    notes?: Record<string, string>;
  }): Promise<RefundResult>;
  /**
   * Route the vendor's share of a captured payment to their linked account, on hold with no
   * automatic release date: only `releaseTransfer` settles it, so claims and review holds on our
   * side really do stop the money. Returns the provider transfer id.
   */
  transferToVendor(input: {
    providerPaymentId: string;
    accountRef: string;
    amountPaise: Paise;
  }): Promise<string>;
  releaseTransfer(providerTransferId: string): Promise<void>;
  /**
   * Take a vendor transfer back into the platform account (a clawback after an approved claim).
   * Returns the provider reversal id.
   */
  reverseTransfer(providerTransferId: string, amountPaise: Paise): Promise<string>;
}
