"use client";

import { ApiError } from "@food-del/api-client";
import { queryKeys, useCancelOrder, useOrder } from "@food-del/api-client/react";
import { CUSTOMER_TIMELINE, SHIPMENT_STATUS_LABELS } from "@food-del/domain";
import type { OrderDetail, ShipmentDetail } from "@food-del/domain/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CircleAlert,
  Clock,
  Gift,
  PartyPopper,
  Plane,
  Snowflake,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { QuoteSummary } from "@/components/quote-summary";
import { RequireSession } from "@/components/require-session";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Field, Select, Skeleton, Textarea } from "@/components/ui/primitives";
import { api, DEV_TOOLS } from "@/lib/api";
import { cn } from "@/lib/cn";
import { BASE_PATH } from "@/lib/demo";
import { formatDateTime, formatINR, formatLocalDate, modeLabel, relativeHours } from "@/lib/format";
import { useRouteParams } from "@/lib/route-params";

const STEP_LABELS: Record<string, string> = {
  PLACED: "Order placed",
  BATCHED: "In the kitchen",
  PACKED_COLD_CHAIN: "Packed",
  IN_TRANSIT_INTERCITY: "On its way",
  AT_DESTINATION_HUB: "In your city",
  OUT_FOR_LOCAL_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
};

function Timeline({ s }: { s: ShipmentDetail }) {
  const pos = s.timelinePosition ?? -1;
  if (s.status === "CANCELLED" || s.status === "FAILED") {
    return (
      <p className="flex items-center gap-2 rounded-md bg-paper-deep p-3 text-sm font-semibold text-ink-soft">
        <CircleAlert className="size-4" aria-hidden />
        {s.status === "CANCELLED"
          ? "This parcel was cancelled."
          : "This parcel couldn't be delivered. A refund has been issued where due."}
      </p>
    );
  }
  return (
    <ol className="grid grid-cols-7 gap-1" aria-label="Delivery progress">
      {CUSTOMER_TIMELINE.map((st, i) => {
        const done = i <= pos;
        const current = i === pos;
        return (
          <li
            key={st}
            className="flex flex-col items-center gap-1.5 text-center"
            aria-current={current ? "step" : undefined}
          >
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-pill border-2 text-xs font-bold",
                done
                  ? "border-jaggery bg-jaggery text-white"
                  : "border-line-strong bg-card text-ink-muted",
                current && "ring-4 ring-saffron-soft",
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                "text-[11px] leading-tight",
                done ? "font-semibold text-ink" : "text-ink-muted",
              )}
            >
              {STEP_LABELS[st]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ClaimForm({ shipmentId }: { shipmentId: string }) {
  const [kind, setKind] = useState("SPOILED");
  const [description, setDescription] = useState("");
  const toast = useToast();
  const submit = useMutation({
    mutationFn: () => api.createClaim(shipmentId, { kind: kind as "SPOILED", description }),
    onSuccess: () =>
      toast("success", "Thanks — we'll look into it and get back to you within a day."),
    onError: (e) => toast("error", (e as Error).message),
  });
  return (
    <details className="mt-3 rounded-md border border-line p-3">
      <summary className="text-sm font-semibold text-jaggery">
        Something not right with this parcel?
      </summary>
      <form
        className="mt-3 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <Field label="What happened?" htmlFor={`kind-${shipmentId}`}>
          <Select id={`kind-${shipmentId}`} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="SPOILED">It arrived spoiled or stale</option>
            <option value="DAMAGED">The box or food was damaged</option>
            <option value="MISSING_ITEMS">Something was missing</option>
            <option value="OTHER">Something else</option>
          </Select>
        </Field>
        <Field label="Tell us more" htmlFor={`desc-${shipmentId}`} hint="At least 10 characters.">
          <Textarea
            id={`desc-${shipmentId}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          loading={submit.isPending}
          disabled={description.trim().length < 10}
          className="w-fit"
        >
          Report problem
        </Button>
      </form>
    </details>
  );
}

function Parcel({ s, index }: { s: ShipmentDetail; index: number }) {
  const delivered = s.status === "DELIVERED";
  const last = s.timeline[s.timeline.length - 1];
  return (
    <Card className="overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line bg-paper px-5 py-4">
        <div>
          <h2 className="font-sans text-base font-bold">
            Parcel {index + 1} · {s.vendor.name}, {s.vendor.city.name}
          </h2>
          <p className="text-sm text-ink-soft">
            {SHIPMENT_STATUS_LABELS[s.status]}
            {last ? ` · ${formatDateTime(last.at)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {delivered ? (
            <Badge tone="success">Delivered</Badge>
          ) : s.status !== "CANCELLED" && s.status !== "FAILED" ? (
            <Badge tone="success">Arrives by {formatLocalDate(s.promisedDeliveryDate)}</Badge>
          ) : null}
          {s.isAtRisk && <Badge tone="warning">Delayed — we're on it</Badge>}
        </div>
      </header>
      <div className="flex flex-col gap-4 p-5">
        <Timeline s={s} />
        <ul className="text-sm">
          {s.lines.map((l) => (
            <li key={`${l.itemSlug}-${l.variantLabel}`} className="flex justify-between py-1">
              <Link href={`/delicacy/${l.itemSlug}`} className="hover:text-jaggery">
                {l.quantity} × {l.itemName} ({l.variantLabel})
              </Link>
              <span className="tabular">{formatINR(l.unitPricePaise * l.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 rounded-md bg-paper p-3 text-sm text-ink-soft sm:grid-cols-2">
          <p className="flex items-center gap-2">
            {s.mode === "AIR_EXPRESS" ? (
              <Plane className="size-4 text-jaggery" aria-hidden />
            ) : (
              <Truck className="size-4 text-jaggery" aria-hidden />
            )}
            {modeLabel(s.mode)} · dispatch {formatLocalDate(s.dispatchDate)}
          </p>
          <p className="flex items-center gap-2">
            <Snowflake className="size-4 text-chilled" aria-hidden />
            Best enjoyed by {formatDateTime(s.deliverByAt)}
          </p>
          {s.awbNumber && (
            <p className="tabular sm:col-span-2">
              Courier tracking:{" "}
              {s.trackingUrl ? (
                <a href={s.trackingUrl} className="underline" target="_blank" rel="noreferrer">
                  {s.awbNumber}
                </a>
              ) : (
                s.awbNumber
              )}
            </p>
          )}
          {s.canCancel && (
            <p className="flex items-center gap-2 sm:col-span-2">
              <Clock className="size-4" aria-hidden /> Free cancellation until{" "}
              {formatDateTime(s.orderCutoffAt)} ({relativeHours(s.orderCutoffAt)})
            </p>
          )}
        </div>
        {delivered && <ClaimForm shipmentId={s.id} />}
        <details>
          <summary className="text-sm font-semibold text-ink-muted">Full history</summary>
          <ol className="mt-2 space-y-1 border-l-2 border-line pl-4 text-sm">
            {s.timeline.map((e, i) => (
              <li key={`${e.status}-${i}`}>
                <span className="font-semibold">{e.label}</span> ·{" "}
                <span className="text-ink-muted">{formatDateTime(e.at)}</span>
                {e.note && <span className="block text-ink-muted">{e.note}</span>}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </Card>
  );
}

function OrderView({ order }: { order: OrderDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const cancel = useCancelOrder();
  const [paying, setPaying] = useState(false);
  const placed = useSearchParams().get("placed") === "1";

  async function retryPay() {
    setPaying(true);
    try {
      const r = await api.retryPayment(order.id);
      if (r.checkout?.kind === "fake" && DEV_TOOLS) {
        await api.devPay(order.id);
        await qc.invalidateQueries({ queryKey: queryKeys.order(order.id) });
      } else if (r.checkout) {
        window.location.href = `${BASE_PATH}/checkout`;
      }
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="container-page max-w-4xl py-10">
      {placed && order.status !== "PENDING_PAYMENT" && (
        <div
          className="mb-6 flex items-start gap-3 rounded-lg border border-success/30 bg-success-soft p-4 text-success"
          role="status"
        >
          <PartyPopper className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-bold">Order confirmed — thank you!</p>
            <p className="text-sm">
              We've sent the details on WhatsApp. The kitchen starts on your order after the cutoff.
            </p>
          </div>
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="tabular text-sm font-semibold text-ink-muted">{order.orderNumber}</p>
          <h1 className="text-4xl font-extrabold">{order.statusLabel}</h1>
          <p className="text-sm text-ink-soft">
            Placed {formatDateTime(order.createdAt)} · to {order.shipTo.recipientName},{" "}
            {order.shipTo.cityName} {order.shipTo.pincode}
          </p>
        </div>
        <div className="flex gap-2">
          {order.status === "PENDING_PAYMENT" && (
            <Button loading={paying} onClick={retryPay}>
              Complete payment
            </Button>
          )}
          {order.canCancel && (
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() => {
                if (
                  !window.confirm(
                    "Cancel this order? Parcels still before the kitchen's cutoff will be refunded in full.",
                  )
                )
                  return;
                cancel.mutate(order.id, {
                  onSuccess: () => toast("success", "Order cancelled. Your refund is on its way."),
                  onError: (e) =>
                    toast("error", e instanceof ApiError ? e.message : "Couldn't cancel."),
                });
              }}
            >
              Cancel order
            </Button>
          )}
        </div>
      </div>

      {order.isGift && (
        <p className="mb-6 flex items-start gap-2 rounded-md border border-line bg-card p-4 text-sm">
          <Gift className="mt-0.5 size-4 shrink-0 text-jaggery" aria-hidden />
          <span>
            Gift{order.senderName ? ` from ${order.senderName}` : ""}.
            {order.giftMessage ? ` “${order.giftMessage}”` : ""}
          </span>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-4">
          {order.shipments.map((s, i) => (
            <Parcel key={s.id} s={s} index={i} />
          ))}
        </div>
        <aside>
          <Card className="p-5">
            <h2 className="mb-3 font-sans text-base font-bold">Payment</h2>
            <QuoteSummary totals={order.totals} shipments={order.shipments.length} />
            {order.payment && (
              <p className="mt-3 text-xs text-ink-muted">
                {order.payment.status === "CAPTURED"
                  ? "Paid"
                  : order.payment.status.toLowerCase().replace(/_/g, " ")}
                {order.payment.method ? ` via ${order.payment.method.toUpperCase()}` : ""}
                {order.payment.refundedPaise > 0
                  ? ` · refunded ${formatINR(order.payment.refundedPaise)}`
                  : ""}
              </p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function OrderPage() {
  const { id } = useRouteParams<{ id: string }>();
  const order = useOrder(id);
  if (order.isLoading)
    return (
      <div className="container-page max-w-4xl py-10">
        <Skeleton className="h-96" />
      </div>
    );
  if (order.error || !order.data) {
    return (
      <div className="container-page py-16 text-center">
        <h1 className="text-3xl font-bold">We couldn't find that order</h1>
        <Link href="/orders" className="mt-4 inline-block font-semibold text-jaggery underline">
          Your orders
        </Link>
      </div>
    );
  }
  return <OrderView order={order.data} />;
}

export function OrderDetailPage() {
  return (
    <RequireSession title="Sign in to track your order">
      <Suspense>
        <OrderPage />
      </Suspense>
    </RequireSession>
  );
}
