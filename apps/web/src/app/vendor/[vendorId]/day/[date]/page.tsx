"use client";

import { ApiError } from "@food-del/api-client";
import { queryKeys } from "@food-del/api-client/react";
import { addDays } from "@food-del/domain";
import type { VendorShipment } from "@food-del/domain/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Gift, Printer, Snowflake, Tag } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { KITCHEN_ROLES, RoleGate } from "@/components/role-gate";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { formatDateTime, formatLocalDate, modeLabel } from "@/lib/format";

function ParcelRow({ s, onChanged }: { s: VendorShipment; onChanged: () => void }) {
  const toast = useToast();
  const pack = useMutation({
    mutationFn: () => api.packShipment(s.id),
    onSuccess: () => {
      toast("success", `${s.orderNumber} packed. Courier booked.`);
      onChanged();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "Couldn't mark packed."),
  });
  const shortfall = useMutation({
    mutationFn: (note: string) => api.reportShortfall(s.id, note),
    onSuccess: () => {
      toast("success", `${s.orderNumber}: customer refunded.`);
      onChanged();
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <span className="tabular">{s.orderNumber}</span>
          <Badge tone={s.status === "FAILED" ? "danger" : s.canPack ? "warning" : "success"}>
            {s.statusLabel}
          </Badge>
          {s.isGift && (
            <Badge tone="saffron">
              <Gift className="size-3" aria-hidden /> Gift
            </Badge>
          )}
        </p>
        <ul className="text-sm">
          {s.lines.map((l) => (
            <li key={`${l.itemName}-${l.variantLabel}`}>
              <strong className="tabular">{l.quantity} ×</strong> {l.itemName} ({l.variantLabel})
            </li>
          ))}
        </ul>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          <span className="flex items-center gap-1">
            {s.coolant !== "NONE" && <Snowflake className="size-3.5 text-chilled" aria-hidden />}
            {s.packagingName}
          </span>
          <span>
            {modeLabel(s.mode)} · {s.carrierCode}
          </span>
          <span>
            To {s.recipientName}, {s.destCity} {s.destPincode}
          </span>
          <span>Arrives by {formatLocalDate(s.promisedDeliveryDate)}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 print:hidden">
        {s.labelUrl && (
          <a
            href={s.labelUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong px-3 text-sm font-semibold hover:border-jaggery"
          >
            <Tag className="size-4" aria-hidden /> Label {s.awbNumber}
          </a>
        )}
        {s.canPack && (
          <Button size="sm" loading={pack.isPending} onClick={() => pack.mutate()}>
            Mark packed
          </Button>
        )}
        {s.canReportShortfall && (
          <Button
            size="sm"
            variant="danger"
            loading={shortfall.isPending}
            onClick={() => {
              const note = window.prompt(
                "Why can't this parcel be made? The customer will be refunded in full.",
              );
              if (note && note.trim().length >= 3) shortfall.mutate(note.trim());
            }}
          >
            Can't make it
          </Button>
        )}
      </div>
    </li>
  );
}

function Day() {
  const { vendorId, date } = useParams<{ vendorId: string; date: string }>();
  const qc = useQueryClient();
  const day = useQuery({
    queryKey: queryKeys.vendorDay(vendorId, date),
    queryFn: () => api.vendorDay(vendorId, date),
    refetchInterval: 30_000,
  });
  const d = day.data;
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.vendorDay(vendorId, date) });

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/vendor" className="text-sm font-semibold text-jaggery">
          ← Kitchen portal
        </Link>
        <div className="flex items-center gap-2">
          <Link
            aria-label="Previous day"
            href={`/vendor/${vendorId}/day/${addDays(date, -1)}`}
            className="flex size-10 items-center justify-center rounded-md border border-line-strong bg-card"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <Link
            aria-label="Next day"
            href={`/vendor/${vendorId}/day/${addDays(date, 1)}`}
            className="flex size-10 items-center justify-center rounded-md border border-line-strong bg-card"
          >
            <ChevronRight className="size-4" />
          </Link>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> Print
          </Button>
        </div>
      </div>
      <h1 className="text-3xl font-extrabold md:text-4xl">Dispatch {formatLocalDate(date)}</h1>
      {d && (
        <p className="mt-1 text-ink-soft">
          {d.vendor.name} · orders {d.isLocked ? "closed" : "close"}{" "}
          {formatDateTime(d.orderCutoffAt)} · ready for pickup by {d.readyForPickupLocal}
        </p>
      )}
      {day.isLoading ? (
        <Skeleton className="mt-6 h-64" />
      ) : !d || d.counts.total === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No parcels for this day"
            body="Orders appear here as customers book this dispatch day."
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_1fr]">
          <div className="flex flex-col gap-4">
            <Card className="p-4">
              <h2 className="mb-3 font-sans text-base font-bold">Production sheet</h2>
              {!d.isLocked && (
                <p className="mb-2 text-xs font-semibold text-warning">
                  Provisional — more orders may arrive before the cutoff.
                </p>
              )}
              <table className="tabular w-full text-sm">
                <tbody>
                  {d.production.map((p) => (
                    <tr key={p.variantId} className="border-t border-line first:border-0">
                      <td className="py-2 pr-2">
                        {p.itemName}
                        <span className="block text-xs text-ink-muted">
                          {p.variantLabel}
                          {p.tempClass === "CHILLED" ? " · keep chilled" : ""}
                        </span>
                      </td>
                      <td className="py-2 text-right text-lg font-bold">{p.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 font-sans text-base font-bold">Packaging to prepare</h2>
              <ul className="space-y-1 text-sm">
                {d.packagingNeeded.map((p) => (
                  <li key={p.code} className="flex justify-between">
                    <span>{p.name}</span>
                    <strong className="tabular">{p.count}</strong>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-muted">
                Freeze gel packs overnight; pack chilled parcels last, just before pickup.
              </p>
            </Card>
            <Card className="p-4 text-sm">
              <p className="tabular">
                <strong>{d.counts.packed}</strong> of {d.counts.total} packed ·{" "}
                {d.counts.handedOver} handed over
              </p>
              {d.batches.map((b) => (
                <p key={b.id} className="text-ink-muted">
                  {b.carrierCode} pickup {b.pickupRef ?? "pending"} · {b.status.toLowerCase()}
                </p>
              ))}
            </Card>
          </div>
          <Card className="px-4">
            <h2 className="pt-4 font-sans text-base font-bold">Parcels</h2>
            <ul className="divide-y divide-line">
              {d.shipments.map((s) => (
                <ParcelRow key={s.id} s={s} onChanged={refresh} />
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function VendorDayPage() {
  return (
    <RoleGate roles={KITCHEN_ROLES} title="Kitchen sign-in">
      <Day />
    </RoleGate>
  );
}
