"use client";

import { ApiError } from "@food-del/api-client";
import {
  FAILURE_REASONS,
  nextStatuses,
  SHIPMENT_STATUS_LABELS,
  type ShipmentStatus,
} from "@food-del/domain";
import type { OpsShipmentRow } from "@food-del/domain/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { api, DEV_TOOLS } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime, formatINR, formatLocalDate } from "@/lib/format";
import { useToast } from "./toast";
import { Badge, Button, Select } from "./ui/primitives";

function Actions({ row }: { row: OpsShipmentRow }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [to, setTo] = useState<string>("");
  const [reason, setReason] = useState<string>("SPOILED");
  const options = nextStatuses(row.status, "OPS");
  const done = () =>
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("ops") });
  const transition = useMutation({
    mutationFn: () =>
      api.opsTransition(row.id, {
        to: to as ShipmentStatus,
        failureReason: to === "FAILED" ? (reason as (typeof FAILURE_REASONS)[number]) : undefined,
        note: window.prompt("Note for the audit trail (optional)") ?? undefined,
      }),
    onSuccess: () => {
      toast("success", `${row.orderNumber} → ${SHIPMENT_STATUS_LABELS[to as ShipmentStatus]}`);
      setTo("");
      void done();
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "Failed"),
  });
  const advance = useMutation({
    mutationFn: (status: string) => api.devAdvance(row.id, status),
    onSuccess: (r) => {
      toast("success", `Courier event: ${r.outcomes.join(", ")}`);
      void done();
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  const carrierNext: ShipmentStatus | undefined = (
    {
      PACKED_COLD_CHAIN: "PICKED_UP",
      PICKED_UP: "IN_TRANSIT_INTERCITY",
      IN_TRANSIT_INTERCITY: "AT_DESTINATION_HUB",
      AT_DESTINATION_HUB: "OUT_FOR_LOCAL_DELIVERY",
      OUT_FOR_LOCAL_DELIVERY: "DELIVERED",
      DELIVERY_ATTEMPT_FAILED: "OUT_FOR_LOCAL_DELIVERY",
    } as Partial<Record<ShipmentStatus, ShipmentStatus>>
  )[row.status];

  if (options.length === 0) return <span className="text-xs text-ink-muted">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        aria-label={`Move ${row.orderNumber}`}
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="h-9 w-40 text-sm"
      >
        <option value="">Move to…</option>
        {options.map((s) => (
          <option key={s} value={s}>
            {SHIPMENT_STATUS_LABELS[s]}
          </option>
        ))}
      </Select>
      {to === "FAILED" && (
        <Select
          aria-label="Failure reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-9 w-36 text-sm"
        >
          {FAILURE_REASONS.map((r) => (
            <option key={r} value={r}>
              {r.replace(/_/g, " ").toLowerCase()}
            </option>
          ))}
        </Select>
      )}
      <Button
        size="sm"
        disabled={!to}
        loading={transition.isPending}
        onClick={() => transition.mutate()}
      >
        Apply
      </Button>
      {DEV_TOOLS && carrierNext && row.awbNumber && (
        <Button
          size="sm"
          variant="ghost"
          loading={advance.isPending}
          onClick={() => advance.mutate(carrierNext)}
          title="Simulate the next courier scan (dev)"
        >
          Courier: {SHIPMENT_STATUS_LABELS[carrierNext]}
        </Button>
      )}
    </div>
  );
}

export function OpsShipmentsTable({
  rows,
  empty,
}: {
  rows: OpsShipmentRow[];
  /** What to say when there are no rows. */
  empty?: ReactNode;
}) {
  if (rows.length === 0) {
    return empty ?? <p className="py-8 text-center text-sm text-ink-muted">No parcels match.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[64rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
            <th scope="col" className="sticky left-0 z-10 bg-card p-3">
              Order
            </th>
            <th scope="col" className="p-3">
              Route
            </th>
            <th scope="col" className="p-3">
              Status
            </th>
            <th scope="col" className="p-3">
              Promise
            </th>
            <th scope="col" className="p-3">
              Spoils
            </th>
            <th scope="col" className="p-3">
              Value
            </th>
            <th scope="col" className="p-3">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={cn("border-b border-line align-top", r.isAtRisk && "bg-warning-soft/40")}
            >
              {/* Pinned so the order stays in view while the row scrolls sideways on narrow screens. */}
              <td className={cn("sticky left-0 z-10 bg-card p-3", r.isAtRisk && "bg-warning-soft")}>
                <span className="font-semibold">{r.orderNumber}</span>
                <span className="block text-xs text-ink-muted">{r.vendorName}</span>
                {r.awbNumber && (
                  <span className="block text-xs text-ink-muted">AWB {r.awbNumber}</span>
                )}
              </td>
              <td className="p-3">
                {r.originCity} → {r.destCity}
                <span className="block text-xs text-ink-muted">
                  {r.carrierCode} · {r.mode === "AIR_EXPRESS" ? "air" : "surface"}
                </span>
              </td>
              <td className="p-3">
                <Badge
                  tone={
                    r.isAtRisk
                      ? "warning"
                      : r.status === "FAILED"
                        ? "danger"
                        : r.status === "DELIVERED"
                          ? "success"
                          : "info"
                  }
                >
                  {r.statusLabel}
                </Badge>
                {r.isAtRisk && (
                  <span className="mt-1 block text-xs font-semibold text-warning">At risk</span>
                )}
                {r.failureReason && (
                  <span className="mt-1 block text-xs text-danger">
                    {r.failureReason.toLowerCase().replace(/_/g, " ")}
                  </span>
                )}
              </td>
              <td className="p-3">
                Dispatch {formatLocalDate(r.dispatchDate)}
                <span className="block text-xs text-ink-muted">
                  by {formatLocalDate(r.promisedDeliveryDate)}
                </span>
              </td>
              <td
                className={cn(
                  "p-3",
                  r.hoursToSpoilage < 12 && r.status !== "DELIVERED" && "font-bold text-danger",
                )}
              >
                {formatDateTime(r.deliverByAt)}
                <span className="block text-xs">
                  {r.hoursToSpoilage >= 0
                    ? `${r.hoursToSpoilage} h left`
                    : `${-r.hoursToSpoilage} h past`}
                </span>
              </td>
              <td className="p-3">{formatINR(r.itemsTotalPaise)}</td>
              <td className="p-3">
                <Actions row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
