"use client";

import { ApiError, newIdempotencyKey } from "@food-del/api-client";
import { queryKeys, useQuote } from "@food-del/api-client/react";
import { normaliseIndianMobile } from "@food-del/domain";
import type {
  Address,
  CheckoutConfig,
  OrderDetail,
  PlaceOrderResponse,
  Quote,
} from "@food-del/domain/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Gift, Lock, Timer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LoginForm } from "@/components/login-form";
import { QuoteSummary } from "@/components/quote-summary";
import { ShipmentPlanCard } from "@/components/shipment-plan-card";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Textarea,
} from "@/components/ui/primitives";
import { api, DEV_TOOLS } from "@/lib/api";
import { cart, useCart } from "@/lib/cart";
import { cn } from "@/lib/cn";
import { useDestination } from "@/lib/destination";
import { formatINR } from "@/lib/format";
import { useSession } from "@/lib/session";

interface AddressForm {
  recipientName: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
}

const EMPTY_ADDRESS: AddressForm = {
  recipientName: "",
  phone: "",
  line1: "",
  line2: "",
  landmark: "",
};

function validate(a: AddressForm): Partial<Record<keyof AddressForm, string>> {
  const e: Partial<Record<keyof AddressForm, string>> = {};
  if (a.recipientName.trim().length < 2) e.recipientName = "Enter the recipient's name.";
  if (!normaliseIndianMobile(a.phone)) e.phone = "Enter a 10-digit Indian mobile number.";
  if (a.line1.trim().length < 3) e.line1 = "Enter house number, building and street.";
  return e;
}

declare global {
  interface Window {
    Razorpay?: new (
      options: Record<string, unknown>,
    ) => { open(): void; on(event: string, cb: (r: unknown) => void): void };
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the payment window. Check your connection."));
    document.body.appendChild(s);
  });
}

function HoldTimer({ until }: { until: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!until) return null;
  const left = Math.max(0, new Date(until).getTime() - now);
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <p className="flex items-center gap-2 text-sm font-semibold text-warning" aria-live="off">
      <Timer className="size-4" aria-hidden />
      {left > 0 ? (
        <>
          We're holding your items for{" "}
          <span className="tabular">
            {m}:{String(s).padStart(2, "0")}
          </span>
        </>
      ) : (
        "Your hold has expired — the items may still be available if you pay now."
      )}
    </p>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const lines = useCart();
  const { pincode } = useDestination();
  const { token, user } = useSession();

  const request = useMemo(
    () =>
      pincode && lines.length
        ? {
            pincode,
            lines: lines.map((l) => ({
              variantId: l.variantId,
              quantity: l.quantity,
              arriveOn: l.arriveOn,
            })),
          }
        : null,
    [pincode, lines],
  );
  const quote = useQuote(request);
  const addresses = useQuery({
    queryKey: queryKeys.addresses,
    queryFn: api.addresses,
    enabled: Boolean(token),
  });
  const savedHere = (addresses.data ?? []).filter((a) => a.pincode === pincode);

  const [addressId, setAddressId] = useState<string | "new">("new");
  const [form, setForm] = useState<AddressForm>(EMPTY_ADDRESS);
  const [touched, setTouched] = useState<Partial<Record<keyof AddressForm, boolean>>>({});
  const [saveAddress, setSaveAddress] = useState(true);
  const [isGift, setIsGift] = useState(false);
  const [gift, setGift] = useState({ senderName: "", message: "", hidePrices: true });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [changedQuote, setChangedQuote] = useState<Quote | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<PlaceOrderResponse | null>(null);
  const [paying, setPaying] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    if (savedHere.length > 0 && addressId === "new" && !touched.recipientName) {
      setAddressId(savedHere.find((a) => a.isDefault)?.id ?? savedHere[0]!.id);
    }
  }, [savedHere, addressId, touched.recipientName]);

  useEffect(() => {
    if (user && !form.recipientName && !touched.recipientName) {
      setForm((f) => ({
        ...f,
        recipientName: user.fullName ?? "",
        phone: user.phone?.replace(/^\+91/, "") ?? "",
      }));
    }
  }, [user, form.recipientName, touched.recipientName]);

  const errors = addressId === "new" ? validate(form) : {};
  const showError = (k: keyof AddressForm) => (touched[k] ? errors[k] : undefined);

  if (!pincode || lines.length === 0) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title={lines.length === 0 ? "Nothing to check out" : "Where should it arrive?"}
          body={lines.length === 0 ? "Your cart is empty." : "Add a pincode in your cart first."}
          action={
            <ButtonLink href={lines.length ? "/cart" : "/search"}>
              {lines.length ? "Back to cart" : "Browse delicacies"}
            </ButtonLink>
          }
        />
      </div>
    );
  }

  async function placeOrder() {
    setSubmitError(null);
    setChangedQuote(null);
    const address = addressId === "new" ? form : null;
    if (address) {
      setTouched({ recipientName: true, phone: true, line1: true });
      if (Object.keys(validate(address)).length > 0) {
        setSubmitError("Please fix the delivery address.");
        requestAnimationFrame(() => errorRef.current?.focus());
        return;
      }
    }
    const q = quote.data;
    if (!q?.totals.isComplete || !request) return;
    const saved = savedHere.find((a) => a.id === addressId);
    const shipTo = saved
      ? {
          recipientName: saved.recipientName,
          phone: saved.phone,
          line1: saved.line1,
          line2: saved.line2,
          landmark: saved.landmark,
        }
      : {
          recipientName: form.recipientName,
          phone: form.phone,
          line1: form.line1,
          line2: form.line2 || null,
          landmark: form.landmark || null,
        };

    setPlacing(true);
    try {
      keyRef.current ??= newIdempotencyKey();
      const res = await api.placeOrder(
        {
          ...request,
          shipTo,
          gift: isGift
            ? {
                senderName: gift.senderName || null,
                message: gift.message || null,
                hidePrices: gift.hidePrices,
              }
            : null,
          expectedTotalPaise: q.totals.grandTotalPaise,
        },
        keyRef.current,
      );
      if (!saved && saveAddress) {
        api
          .addAddress({ ...shipTo, pincode: request.pincode })
          .then(() => qc.invalidateQueries({ queryKey: queryKeys.addresses }))
          .catch(() => {});
      }
      setPlaced(res);
      if (res.checkout) await pay(res.order, res.checkout);
    } catch (e) {
      keyRef.current = null;
      if (e instanceof ApiError) {
        if (e.code === "PRICE_CHANGED" || e.code === "CART_NOT_DELIVERABLE") {
          const fresh = (e.details as { quote?: Quote } | undefined)?.quote ?? null;
          setChangedQuote(fresh);
          await qc.invalidateQueries({ queryKey: ["quote"] });
        }
        if (e.code === "INVALID_PHONE") setTouched((t) => ({ ...t, phone: true }));
        setSubmitError(e.message);
      } else {
        setSubmitError("Something went wrong. Please try again.");
      }
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setPlacing(false);
    }
  }

  async function pay(order: OrderDetail, checkout: CheckoutConfig) {
    setPaying(true);
    setSubmitError(null);
    try {
      if (checkout.kind === "fake") {
        // Development: the order waits for the test-payment button below.
        return;
      }
      await loadRazorpay();
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: checkout.keyId,
          order_id: checkout.providerOrderId,
          amount: checkout.amountPaise,
          currency: checkout.currency,
          name: checkout.name,
          description: checkout.description,
          prefill: { contact: user?.phone ?? undefined, name: user?.fullName ?? undefined },
          theme: { color: "#8A3B0C" },
          handler: async (r: { razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              await api.verifyPayment(order.id, {
                providerPaymentId: r.razorpay_payment_id,
                signature: r.razorpay_signature,
              });
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          modal: {
            ondismiss: () =>
              reject(
                new Error("Payment wasn't completed. Your items are still on hold — try again."),
              ),
          },
        });
        rzp.open();
      });
      finish(order.id);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Payment failed. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  async function payTest(orderId: string) {
    setPaying(true);
    try {
      await api.devPay(orderId);
      finish(orderId);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Test payment failed.");
      setPaying(false);
    }
  }

  function finish(orderId: string) {
    cart.clear();
    void qc.invalidateQueries({ queryKey: queryKeys.orders });
    router.push(`/orders/${orderId}?placed=1`);
  }

  const q = quote.data;

  return (
    <div className="container-page py-10">
      <h1 className="mb-6 text-4xl font-extrabold">Checkout</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-6">
          {submitError && (
            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft p-4 text-sm text-danger"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">{submitError}</p>
                {changedQuote && (
                  <p className="mt-1">
                    New total:{" "}
                    <strong className="tabular">
                      {formatINR(changedQuote.totals.grandTotalPaise)}
                    </strong>
                    . Review the parcels below and place the order again.
                  </p>
                )}
              </div>
            </div>
          )}

          <Card className="p-5">
            <h2 className="mb-1 font-sans text-lg font-bold">1. Your phone</h2>
            {token && user ? (
              <p className="text-sm text-ink-soft">
                Signed in as <strong className="tabular">{user.phone}</strong>. Order updates go to
                this number on WhatsApp.
              </p>
            ) : (
              <div className="mt-3 max-w-sm">
                <LoginForm
                  compact
                  onSignedIn={() => void qc.invalidateQueries({ queryKey: queryKeys.addresses })}
                />
              </div>
            )}
          </Card>

          <Card
            className={cn("p-5", !token && "pointer-events-none opacity-50")}
            aria-disabled={!token}
          >
            <h2 className="mb-3 font-sans text-lg font-bold">2. Delivery address in {pincode}</h2>
            {addresses.isLoading && token ? (
              <Skeleton className="h-24" />
            ) : (
              <div className="flex flex-col gap-3">
                {savedHere.map((a: Address) => (
                  <label
                    key={a.id}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-md border p-3",
                      addressId === a.id
                        ? "border-jaggery bg-saffron-soft/40"
                        : "border-line-strong",
                    )}
                  >
                    <input
                      type="radio"
                      name="address"
                      checked={addressId === a.id}
                      onChange={() => setAddressId(a.id)}
                      className="mt-1 accent-[var(--color-jaggery)]"
                    />
                    <span className="text-sm">
                      <strong>{a.recipientName}</strong> ·{" "}
                      <span className="tabular">{a.phone}</span>
                      <br />
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ""}, {a.cityName} {a.pincode}
                    </span>
                  </label>
                ))}
                {savedHere.length > 0 && (
                  <label
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-md border p-3 text-sm font-semibold",
                      addressId === "new" ? "border-jaggery" : "border-line-strong",
                    )}
                  >
                    <input
                      type="radio"
                      name="address"
                      checked={addressId === "new"}
                      onChange={() => setAddressId("new")}
                      className="accent-[var(--color-jaggery)]"
                    />
                    A new address
                  </label>
                )}
                {addressId === "new" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Recipient's name"
                      htmlFor="recipientName"
                      error={showError("recipientName")}
                    >
                      <Input
                        id="recipientName"
                        autoComplete="name"
                        value={form.recipientName}
                        onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
                        onBlur={() => setTouched((t) => ({ ...t, recipientName: true }))}
                        aria-invalid={Boolean(showError("recipientName"))}
                      />
                    </Field>
                    <Field
                      label="Recipient's mobile"
                      htmlFor="phone"
                      error={showError("phone")}
                      hint="The courier calls this number."
                    >
                      <Input
                        id="phone"
                        inputMode="tel"
                        autoComplete="tel-national"
                        className="tabular"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                        aria-invalid={Boolean(showError("phone"))}
                      />
                    </Field>
                    <Field
                      label="House, building, street"
                      htmlFor="line1"
                      error={showError("line1")}
                      className="sm:col-span-2"
                    >
                      <Input
                        id="line1"
                        autoComplete="address-line1"
                        value={form.line1}
                        onChange={(e) => setForm({ ...form, line1: e.target.value })}
                        onBlur={() => setTouched((t) => ({ ...t, line1: true }))}
                        aria-invalid={Boolean(showError("line1"))}
                      />
                    </Field>
                    <Field label="Area / locality (optional)" htmlFor="line2">
                      <Input
                        id="line2"
                        autoComplete="address-line2"
                        value={form.line2}
                        onChange={(e) => setForm({ ...form, line2: e.target.value })}
                      />
                    </Field>
                    <Field
                      label="Landmark (optional)"
                      htmlFor="landmark"
                      hint="Helps the courier find you fast."
                    >
                      <Input
                        id="landmark"
                        value={form.landmark}
                        onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                      />
                    </Field>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={saveAddress}
                        onChange={(e) => setSaveAddress(e.target.checked)}
                        className="size-4 accent-[var(--color-jaggery)]"
                      />
                      Save this address
                    </label>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className={cn("p-5", !token && "pointer-events-none opacity-50")}>
            <label className="flex items-center gap-3 font-sans text-lg font-bold">
              <input
                type="checkbox"
                checked={isGift}
                onChange={(e) => setIsGift(e.target.checked)}
                className="size-5 accent-[var(--color-jaggery)]"
              />
              <Gift className="size-5 text-jaggery" aria-hidden /> 3. This is a gift
            </label>
            {isGift && (
              <div className="mt-4 grid gap-4">
                <Field label="From (your name)" htmlFor="senderName">
                  <Input
                    id="senderName"
                    value={gift.senderName}
                    onChange={(e) => setGift({ ...gift, senderName: e.target.value })}
                    maxLength={80}
                  />
                </Field>
                <Field
                  label="Message"
                  htmlFor="giftMessage"
                  hint={`${280 - gift.message.length} characters left. We'll send it to the recipient on WhatsApp.`}
                >
                  <Textarea
                    id="giftMessage"
                    value={gift.message}
                    onChange={(e) => setGift({ ...gift, message: e.target.value.slice(0, 280) })}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={gift.hidePrices}
                    onChange={(e) => setGift({ ...gift, hidePrices: e.target.checked })}
                    className="size-4 accent-[var(--color-jaggery)]"
                  />
                  Don't show prices to the recipient
                </label>
              </div>
            )}
          </Card>

          <section aria-labelledby="review">
            <h2 id="review" className="mb-3 font-sans text-lg font-bold">
              4. Review your parcels
            </h2>
            <div className="flex flex-col gap-3">
              {(changedQuote ?? q)?.shipments.map((s, i) => (
                <ShipmentPlanCard key={s.key} shipment={s} index={i}>
                  <ul className="text-sm">
                    {s.lines.map((l) => (
                      <li key={l.variantId} className="flex justify-between py-1">
                        <span>
                          {l.quantity} × {l.itemName} ({l.variantLabel})
                        </span>
                        <span className="tabular">{formatINR(l.lineTotalPaise)}</span>
                      </li>
                    ))}
                  </ul>
                </ShipmentPlanCard>
              )) ?? <Skeleton className="h-40" />}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <h2 className="mb-4 font-sans text-lg font-bold">Payment</h2>
            {q ? (
              <QuoteSummary totals={q.totals} shipments={q.shipments.length} />
            ) : (
              <Skeleton className="h-32" />
            )}
            {placed?.checkout ? (
              <div className="mt-5 flex flex-col gap-3">
                <HoldTimer until={placed.order.holdExpiresAt} />
                {placed.checkout.kind === "fake" ? (
                  DEV_TOOLS ? (
                    <div className="rounded-md border border-info/30 bg-info-soft p-3 text-sm text-info">
                      <p className="mb-2 font-semibold">Test mode — no real money moves.</p>
                      <Button
                        className="w-full"
                        loading={paying}
                        onClick={() => payTest(placed.order.id)}
                      >
                        Pay {formatINR(placed.checkout.amountPaise)} (test)
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-danger">Payments are not configured.</p>
                  )
                ) : (
                  <Button
                    size="lg"
                    loading={paying}
                    onClick={() => pay(placed.order, placed.checkout!)}
                  >
                    Pay {formatINR(placed.checkout.amountPaise)}
                  </Button>
                )}
              </div>
            ) : (
              <Button
                size="lg"
                className="mt-5 w-full"
                loading={placing}
                disabled={!token || !q?.totals.isComplete || quote.isFetching}
                onClick={placeOrder}
              >
                <Lock className="size-4" aria-hidden />
                Place order · {q ? formatINR(q.totals.grandTotalPaise) : "…"}
              </Button>
            )}
            <p className="mt-3 text-xs text-ink-muted">
              Pay securely with UPI, cards or netbanking. Perishable orders are prepaid only. Free
              cancellation until the kitchen's cutoff.{" "}
              <Link href="/how-it-works" className="underline">
                Policies
              </Link>
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
