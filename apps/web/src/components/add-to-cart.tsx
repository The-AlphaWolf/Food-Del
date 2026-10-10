"use client";

import { useAvailability } from "@food-del/api-client/react";
import type { CalendarDay, ItemDetail, PlanSummary } from "@food-del/domain/contracts";
import { CalendarClock, Minus, PackageCheck, Plane, Plus, Snowflake, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cart } from "@/lib/cart";
import { cn } from "@/lib/cn";
import { useDestination } from "@/lib/destination";
import { formatDateTime, formatINR, formatLocalDate, modeLabel } from "@/lib/format";
import { DeliveryCalendar } from "./delivery-calendar";
import { PincodeForm } from "./pincode-picker";
import { useToast } from "./toast";
import { Button, ButtonLink, Skeleton } from "./ui/primitives";

function PlanDetails({ plan, cityName }: { plan: PlanSummary; cityName: string }) {
  return (
    <ul className="space-y-2 text-sm">
      <li className="flex items-start gap-2">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-jaggery" aria-hidden />
        <span>
          Order by <strong>{formatDateTime(plan.orderCutoffAt)}</strong>; made and dispatched from{" "}
          {cityName} on <strong>{formatLocalDate(plan.dispatchDate)}</strong>.
        </span>
      </li>
      <li className="flex items-start gap-2">
        {plan.mode === "AIR_EXPRESS" ? (
          <Plane className="mt-0.5 size-4 shrink-0 text-jaggery" aria-hidden />
        ) : (
          <Truck className="mt-0.5 size-4 shrink-0 text-jaggery" aria-hidden />
        )}
        <span>
          {modeLabel(plan.mode)};{" "}
          {plan.usuallyArrivesOn === plan.promisedDeliveryDate ? (
            <>arrives by </>
          ) : (
            <>usually arrives {formatLocalDate(plan.usuallyArrivesOn)}, at the latest </>
          )}
          <strong>{formatLocalDate(plan.promisedDeliveryDate)}</strong>.
        </span>
      </li>
      <li className="flex items-start gap-2">
        {plan.coldChain ? (
          <Snowflake className="mt-0.5 size-4 shrink-0 text-chilled" aria-hidden />
        ) : (
          <PackageCheck className="mt-0.5 size-4 shrink-0 text-jaggery" aria-hidden />
        )}
        <span>
          {plan.packagingName} ({formatINR(plan.packagingFeePaise)}) · shipping{" "}
          {formatINR(plan.shippingFeePaise)}
        </span>
      </li>
    </ul>
  );
}

export function AddToCart({
  item,
  initialPincode,
}: {
  item: ItemDetail;
  initialPincode: string | null;
}) {
  const { pincode: livePincode } = useDestination();
  const pincode = livePincode ?? initialPincode;
  const [variantId, setVariantId] = useState(item.variants[0]!.id);
  const [qty, setQty] = useState(1);
  const [date, setDate] = useState<string | null>(null);
  const [inspected, setInspected] = useState<CalendarDay | null>(null);
  const [added, setAdded] = useState(false);
  const toast = useToast();
  const variant = item.variants.find((v) => v.id === variantId)!;

  const availability = useAvailability(pincode ? { pincode, variantId, qty, days: 21 } : null);
  const days = availability.data?.days ?? [];
  const selectedDay = useMemo(() => days.find((d) => d.date === date) ?? null, [days, date]);
  const plan = selectedDay?.plan ?? availability.data?.earliest ?? null;

  // Keep the chosen date only while it stays available (quantity or variant changes can rule it out).
  useEffect(() => {
    if (date && days.length > 0 && !days.find((d) => d.date === date)?.plan) setDate(null);
  }, [days, date]);

  function add() {
    cart.add({
      variantId,
      quantity: qty,
      arriveOn: date,
      itemSlug: item.slug,
      itemName: item.name,
      variantLabel: variant.label,
      unitPricePaise: variant.pricePaise,
      vendorName: item.vendor.name,
      cityName: item.vendor.city.name,
      artKey: item.artKey,
      tempClass: item.tempClass,
    });
    setAdded(true);
    toast("success", `${item.name} (${variant.label}) added to your cart.`);
  }

  const unavailable = availability.data && !availability.data.earliest;

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-bold">Pack size</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {item.variants.map((v) => (
            <label
              key={v.id}
              className={cn(
                "flex min-h-14 items-center justify-between gap-3 rounded-md border px-4 py-3 transition-colors",
                v.id === variantId
                  ? "border-jaggery bg-saffron-soft/50"
                  : "border-field bg-card hover:border-jaggery",
              )}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="variant"
                  value={v.id}
                  checked={v.id === variantId}
                  onChange={() => setVariantId(v.id)}
                  className="size-4 accent-[var(--color-jaggery)]"
                />
                <span className="font-semibold">{v.label}</span>
              </span>
              <span className="tabular font-bold">{formatINR(v.pricePaise)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-4">
        <span className="text-sm font-bold" id="qty-label">
          Quantity
        </span>
        <div
          className="flex items-center rounded-md border border-field bg-card"
          role="group"
          aria-labelledby="qty-label"
        >
          <button
            type="button"
            className="flex size-11 items-center justify-center disabled:opacity-40"
            aria-label="Fewer"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1}
          >
            <Minus className="size-4" />
          </button>
          <span className="tabular w-8 text-center font-bold" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            className="flex size-11 items-center justify-center disabled:opacity-40"
            aria-label="More"
            onClick={() => setQty((q) => Math.min(20, q + 1))}
            disabled={qty >= 20}
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      <section aria-labelledby="when" className="rounded-lg border border-line bg-paper p-4">
        <h2 id="when" className="mb-1 font-sans text-base font-bold">
          When should it arrive?
        </h2>
        {!pincode ? (
          <div className="mt-3">
            <PincodeForm />
          </div>
        ) : availability.isLoading ? (
          <div className="mt-3 grid grid-cols-7 gap-1">
            {Array.from({ length: 21 }, (_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        ) : unavailable ? (
          <p className="mt-2 text-sm font-medium text-warning">{availability.data?.message}</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-ink-soft">
              Delivering to <strong className="tabular">{pincode}</strong>. Pick a date, or leave it
              for the earliest.
            </p>
            <DeliveryCalendar
              days={days}
              selected={date}
              onSelect={setDate}
              onInspect={setInspected}
            />
            <p className="mt-2 min-h-5 text-sm text-ink-muted" aria-live="polite">
              {inspected && !inspected.plan
                ? `${formatLocalDate(inspected.date)}: ${inspected.message}`
                : date
                  ? `Arriving ${formatLocalDate(date)}.`
                  : plan
                    ? `Earliest: ${formatLocalDate(plan.promisedDeliveryDate)}.`
                    : ""}
            </p>
            {date && (
              <button
                type="button"
                className="text-sm font-semibold text-jaggery hover:underline"
                onClick={() => setDate(null)}
              >
                Clear date (earliest available)
              </button>
            )}
            {plan && (
              <div className="mt-4 border-t border-line pt-4">
                <PlanDetails plan={plan} cityName={item.vendor.city.name} />
                {plan.remainingUnits > 0 && plan.remainingUnits <= 10 && (
                  <p className="mt-3 text-sm font-semibold text-warning">
                    Only {plan.remainingUnits} left for this dispatch day.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          size="lg"
          className="flex-1"
          onClick={add}
          disabled={Boolean(pincode && (unavailable || availability.isLoading))}
        >
          Add to cart · {formatINR(variant.pricePaise * qty)}
        </Button>
        {added && (
          <ButtonLink href="/cart" variant="secondary" size="lg">
            Go to cart
          </ButtonLink>
        )}
      </div>
      <p className="text-xs text-ink-muted">
        Shipping and packaging are added per parcel at checkout. Prices include GST.{" "}
        <Link href="/how-it-works" className="underline">
          How fresh delivery works
        </Link>
      </p>
    </div>
  );
}
