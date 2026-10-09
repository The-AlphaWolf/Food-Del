"use client";

import { useOrders } from "@food-del/api-client/react";
import { Package } from "lucide-react";
import Link from "next/link";
import { RequireSession } from "@/components/require-session";
import { Badge, ButtonLink, EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatDateTime, formatINR, formatLocalDate } from "@/lib/format";

function Orders() {
  const orders = useOrders();
  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="mb-6 text-4xl font-extrabold">Your orders</h1>
      {orders.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : !orders.data?.length ? (
        <EmptyState
          icon={<Package className="size-10" />}
          title="No orders yet"
          body="When you order, you can track every parcel here."
          action={<ButtonLink href="/search">Browse delicacies</ButtonLink>}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.data.map((o) => (
            <li key={o.id}>
              <Link
                href={`/orders/${o.id}`}
                className="flex flex-col gap-1 rounded-lg border border-line bg-card p-4 hover:shadow-card sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold">{o.headline}</p>
                  <p className="text-sm text-ink-muted">
                    <span className="tabular">{o.orderNumber}</span> · {formatDateTime(o.createdAt)}{" "}
                    · to {o.destCity}
                  </p>
                </div>
                <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                  <Badge
                    tone={
                      o.status === "COMPLETED"
                        ? "success"
                        : o.status === "CANCELLED" || o.status === "EXPIRED"
                          ? "neutral"
                          : "info"
                    }
                  >
                    {o.statusLabel}
                  </Badge>
                  <span className="tabular text-sm font-bold">{formatINR(o.grandTotalPaise)}</span>
                  {o.nextDeliveryDate && (
                    <span className="text-xs text-ink-muted">
                      Next arrival {formatLocalDate(o.nextDeliveryDate)}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <RequireSession title="Sign in to see your orders">
      <Orders />
    </RequireSession>
  );
}
