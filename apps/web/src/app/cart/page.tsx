"use client";

import { ApiError } from "@food-del/api-client";
import { useQuote } from "@food-del/api-client/react";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { DietMark } from "@/components/badges";
import { ItemArt } from "@/components/item-art";
import { PincodeForm } from "@/components/pincode-picker";
import { QuoteSummary } from "@/components/quote-summary";
import { ShipmentPlanCard } from "@/components/shipment-plan-card";
import { ButtonLink, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { cart, useCart } from "@/lib/cart";
import { useDestination } from "@/lib/destination";
import { formatINR, formatLocalDate } from "@/lib/format";

export default function CartPage() {
  const lines = useCart();
  const { pincode } = useDestination();
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

  // Drop items the store no longer sells.
  useEffect(() => {
    const err = quote.error;
    if (err instanceof ApiError && err.code === "ITEM_UNAVAILABLE") {
      const ids = (err.details as { variantIds?: string[] } | undefined)?.variantIds ?? [];
      if (ids.length) cart.removeVariants(ids);
    }
  }, [quote.error]);

  if (lines.length === 0) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={<ShoppingBag className="size-10" />}
          title="Your cart is empty"
          body="Find something wonderful from Kolkata, Hyderabad, Old Delhi or Mysuru."
          action={<ButtonLink href="/search">Browse delicacies</ButtonLink>}
        />
      </div>
    );
  }

  const byVariant = new Map(lines.map((l) => [`${l.variantId}|${l.arriveOn ?? ""}`, l]));
  const q = quote.data;

  return (
    <div className="container-page py-10">
      <h1 className="mb-6 text-4xl font-extrabold">Your cart</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          {!pincode && (
            <Card className="p-5">
              <p className="mb-3 font-semibold">
                Add your pincode to see delivery dates and shipping.
              </p>
              <PincodeForm />
            </Card>
          )}
          {quote.error &&
            !(quote.error instanceof ApiError && quote.error.code === "ITEM_UNAVAILABLE") && (
              <p className="rounded-md bg-danger-soft p-3 text-sm text-danger" role="alert">
                {(quote.error as Error).message}
              </p>
            )}
          {pincode && quote.isLoading && !q
            ? Array.from({ length: Math.min(lines.length, 2) }, (_, i) => (
                <Skeleton key={i} className="h-48" />
              ))
            : q
              ? q.shipments.map((s, i) => (
                  <ShipmentPlanCard key={s.key} shipment={s} index={i}>
                    <ul className="divide-y divide-line">
                      {s.lines.map((l) => {
                        const local = byVariant.get(`${l.variantId}|${s.arriveOn ?? ""}`);
                        return (
                          <li key={l.variantId} className="flex gap-3 py-3">
                            <div className="size-16 shrink-0 overflow-hidden rounded-md border border-line">
                              <ItemArt art={l.artKey} tempClass={l.tempClass} />
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <div className="flex items-start justify-between gap-2">
                                <Link
                                  href={`/delicacy/${l.itemSlug}`}
                                  className="font-semibold hover:text-jaggery"
                                >
                                  {l.itemName}
                                </Link>
                                <span className="tabular font-bold">
                                  {formatINR(l.lineTotalPaise)}
                                </span>
                              </div>
                              <p className="flex items-center gap-2 text-sm text-ink-muted">
                                <DietMark diet={l.diet} /> {l.variantLabel} ·{" "}
                                {formatINR(l.unitPricePaise)} each
                              </p>
                              {s.arriveOn && (
                                <p className="text-xs font-semibold text-jaggery">
                                  Requested for {formatLocalDate(s.arriveOn)}
                                </p>
                              )}
                              <div className="mt-1 flex items-center gap-2">
                                <div className="flex items-center rounded-md border border-field">
                                  <button
                                    type="button"
                                    className="flex size-9 items-center justify-center"
                                    aria-label={`Fewer ${l.itemName}`}
                                    onClick={() =>
                                      cart.setQuantity(l.variantId, s.arriveOn, l.quantity - 1)
                                    }
                                  >
                                    <Minus className="size-4" />
                                  </button>
                                  <span className="tabular w-7 text-center text-sm font-bold">
                                    {l.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    className="flex size-9 items-center justify-center disabled:opacity-40"
                                    aria-label={`More ${l.itemName}`}
                                    disabled={l.quantity >= 20}
                                    onClick={() =>
                                      cart.setQuantity(l.variantId, s.arriveOn, l.quantity + 1)
                                    }
                                  >
                                    <Plus className="size-4" />
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  className="flex size-9 items-center justify-center rounded-md text-ink-muted hover:bg-danger-soft hover:text-danger"
                                  aria-label={`Remove ${l.itemName}`}
                                  onClick={() => cart.remove(l.variantId, s.arriveOn)}
                                >
                                  <Trash2 className="size-4" />
                                </button>
                                {s.arriveOn && local && (
                                  <button
                                    type="button"
                                    className="text-xs font-semibold text-ink-muted underline"
                                    onClick={() =>
                                      cart.setArriveOn([l.variantId], s.arriveOn, null)
                                    }
                                  >
                                    Earliest instead
                                  </button>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </ShipmentPlanCard>
                ))
              : lines.map((l) => (
                  <Card
                    key={`${l.variantId}-${l.arriveOn}`}
                    className="flex items-center justify-between p-4"
                  >
                    <span className="font-semibold">
                      {l.itemName} · {l.variantLabel} × {l.quantity}
                    </span>
                    <span className="tabular">{formatINR(l.unitPricePaise * l.quantity)}</span>
                  </Card>
                ))}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <h2 className="mb-4 font-sans text-lg font-bold">Order summary</h2>
            {q ? (
              <QuoteSummary totals={q.totals} shipments={q.shipments.length} />
            ) : (
              <p className="text-sm text-ink-muted">
                Shipping is calculated once we know your pincode.
              </p>
            )}
            {q && !q.totals.isComplete && (
              <p className="mt-3 text-sm font-medium text-warning">
                Fix the highlighted parcels to continue.
              </p>
            )}
            <ButtonLink
              href="/checkout"
              size="lg"
              className="mt-5 w-full"
              aria-disabled={!q?.totals.isComplete}
              tabIndex={q?.totals.isComplete ? undefined : -1}
              style={q?.totals.isComplete ? undefined : { pointerEvents: "none", opacity: 0.5 }}
            >
              Checkout
            </ButtonLink>
          </Card>
        </aside>
      </div>
    </div>
  );
}
