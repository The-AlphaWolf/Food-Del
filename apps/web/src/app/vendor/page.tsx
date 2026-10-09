"use client";

import { queryKeys } from "@food-del/api-client/react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChefHat, Clock, IndianRupee, Package } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { KITCHEN_ROLES, RoleGate } from "@/components/role-gate";
import { Badge, Card, Select, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { formatDateTime, formatINR, formatLocalDate, relativeHours } from "@/lib/format";

function Overview() {
  const kitchens = useQuery({ queryKey: queryKeys.kitchens, queryFn: api.kitchens });
  const [vendorId, setVendorId] = useState<string | null>(null);
  useEffect(() => {
    if (!vendorId && kitchens.data?.[0]) setVendorId(kitchens.data[0].id);
  }, [kitchens.data, vendorId]);
  const overview = useQuery({
    queryKey: queryKeys.vendorOverview(vendorId ?? ""),
    queryFn: () => api.vendorOverview(vendorId!),
    enabled: Boolean(vendorId),
    refetchInterval: 60_000,
  });

  if (kitchens.isLoading)
    return (
      <div className="container-page py-10">
        <Skeleton className="h-64" />
      </div>
    );
  if (!kitchens.data?.length)
    return (
      <div className="container-page py-10">
        <p>No kitchens linked to this account.</p>
      </div>
    );
  const o = overview.data;
  return (
    <div className="container-page py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-jaggery">
            Kitchen portal
          </p>
          <h1 className="text-3xl font-extrabold md:text-4xl">
            {o?.vendor.name ?? "Your kitchen"}
          </h1>
        </div>
        {kitchens.data.length > 1 && (
          <div className="flex items-center gap-2 text-sm font-semibold">
            <label htmlFor="vendor-kitchen">Kitchen</label>
            <Select
              id="vendor-kitchen"
              value={vendorId ?? ""}
              onChange={(e) => setVendorId(e.target.value)}
              className="w-64"
            >
              {kitchens.data.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      {!o ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <Card className="flex items-center gap-4 p-4">
              <IndianRupee className="size-6 text-jaggery" aria-hidden />
              <div>
                <p className="text-sm text-ink-muted">
                  Payouts on hold (released 24 h after delivery)
                </p>
                <p className="tabular text-xl font-bold">{formatINR(o.payouts.onHoldPaise)}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-4 p-4">
              <IndianRupee className="size-6 text-success" aria-hidden />
              <div>
                <p className="text-sm text-ink-muted">Released to your account</p>
                <p className="tabular text-xl font-bold">{formatINR(o.payouts.releasedPaise)}</p>
              </div>
            </Card>
          </div>
          <h2 className="mb-3 font-sans text-lg font-bold">Dispatch days</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {o.upcoming.map((d) => {
              const open = new Date(d.cutoffAt).getTime() > Date.now();
              return (
                <li key={d.date}>
                  <Link
                    href={`/vendor/${o.vendor.id}/day/${d.date}`}
                    className="flex h-full flex-col gap-2 rounded-lg border border-line bg-card p-4 hover:shadow-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-bold">
                        <CalendarDays className="size-4 text-jaggery" aria-hidden />
                        {formatLocalDate(d.date)}
                      </span>
                      {d.closed ? (
                        <Badge>Closed</Badge>
                      ) : open ? (
                        <Badge tone="info">Orders open</Badge>
                      ) : d.shipments > 0 ? (
                        <Badge tone="saffron">Locked</Badge>
                      ) : (
                        <Badge>No orders</Badge>
                      )}
                    </div>
                    <p className="tabular flex items-center gap-2 text-sm">
                      <Package className="size-4 text-ink-muted" aria-hidden />
                      {d.shipments} parcel{d.shipments === 1 ? "" : "s"} · {d.units} unit
                      {d.units === 1 ? "" : "s"}
                    </p>
                    <p className="flex items-center gap-2 text-xs text-ink-muted">
                      <Clock className="size-3.5" aria-hidden />
                      Cutoff {formatDateTime(d.cutoffAt)} ({relativeHours(d.cutoffAt)})
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/vendor/${o.vendor.id}/inventory`}
              className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-card px-4 py-2.5 font-semibold hover:border-jaggery hover:text-jaggery"
            >
              <ChefHat className="size-4" aria-hidden /> Daily capacity
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function VendorPage() {
  return (
    <RoleGate roles={KITCHEN_ROLES} title="Kitchen sign-in">
      <Overview />
    </RoleGate>
  );
}
