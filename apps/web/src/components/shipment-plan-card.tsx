import type { QuoteShipment } from "@food-del/domain/contracts";
import { CircleAlert, Plane, Snowflake, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { formatDateTime, formatINR, formatLocalDate, modeLabel } from "@/lib/format";
import { Badge } from "./ui/primitives";

/** One parcel in the cart/checkout: who makes it, when it ships, how it travels, what it costs. */
export function ShipmentPlanCard({
  shipment,
  index,
  children,
  footer,
}: {
  shipment: QuoteShipment;
  index: number;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const p = shipment.plan;
  return (
    <section
      className="overflow-hidden rounded-lg border border-line bg-card"
      aria-labelledby={`parcel-${shipment.key}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-4 py-3">
        <div>
          <h2 id={`parcel-${shipment.key}`} className="font-sans text-base font-bold">
            Parcel {index + 1} · {shipment.vendor.name}
          </h2>
          <p className="text-xs text-ink-muted">Made in {shipment.vendor.city.name}</p>
        </div>
        {p && (
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="success">Arrives by {formatLocalDate(p.promisedDeliveryDate)}</Badge>
            {p.coldChain && (
              <Badge tone="chilled">
                <Snowflake className="size-3.5" aria-hidden /> Cold chain
              </Badge>
            )}
          </div>
        )}
      </header>
      <div className="px-4 py-3">{children}</div>
      {p ? (
        <div className="grid gap-2 border-t border-line px-4 py-3 text-sm text-ink-soft sm:grid-cols-2">
          <p className="flex items-center gap-2">
            {p.mode === "AIR_EXPRESS" ? (
              <Plane className="size-4 text-jaggery" aria-hidden />
            ) : (
              <Truck className="size-4 text-jaggery" aria-hidden />
            )}
            {modeLabel(p.mode)} · dispatched {formatLocalDate(p.dispatchDate)}
          </p>
          <p className="tabular sm:text-right">
            Shipping {formatINR(p.shippingFeePaise)} + {p.packagingName.toLowerCase()}{" "}
            {formatINR(p.packagingFeePaise)}
          </p>
          <p className="text-xs text-ink-muted sm:col-span-2">
            Order by {formatDateTime(p.orderCutoffAt)} to keep this date.
          </p>
        </div>
      ) : shipment.issue ? (
        <p
          className="flex items-start gap-2 border-t border-line bg-warning-soft px-4 py-3 text-sm font-medium text-warning"
          role="alert"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {shipment.issue.message}
        </p>
      ) : null}
      {footer}
    </section>
  );
}
