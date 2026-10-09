import type { QuoteTotals } from "@food-del/domain/contracts";
import { formatINR } from "@/lib/format";

export function QuoteSummary({
  totals,
  shipments,
}: {
  totals: Omit<QuoteTotals, "isComplete">;
  shipments: number;
}) {
  return (
    <dl className="tabular space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-ink-soft">Items</dt>
        <dd>{formatINR(totals.itemsTotalPaise)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-ink-soft">
          Shipping ({shipments} parcel{shipments === 1 ? "" : "s"})
        </dt>
        <dd>{formatINR(totals.shippingFeePaise)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-ink-soft">Packaging &amp; cold packs</dt>
        <dd>{formatINR(totals.packagingFeePaise)}</dd>
      </div>
      {totals.discountPaise > 0 && (
        <div className="flex justify-between text-success">
          <dt>Shipping offer</dt>
          <dd>−{formatINR(totals.discountPaise)}</dd>
        </div>
      )}
      <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
        <dt>Total</dt>
        <dd>{formatINR(totals.grandTotalPaise)}</dd>
      </div>
      <p className="text-xs text-ink-muted">
        Includes {formatINR(totals.gstIncludedPaise)} GST on items.
      </p>
    </dl>
  );
}
