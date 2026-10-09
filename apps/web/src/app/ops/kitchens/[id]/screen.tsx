"use client";

import { ApiError } from "@food-del/api-client";
import {
  describeWeekdays,
  formatShelfLife,
  type ReadinessCheck,
  TEMP_LABELS,
} from "@food-del/domain";
import type { KitchenDetail } from "@food-del/domain/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Pencil,
  Plus,
  UserPlus,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { ItemArt } from "@/components/item-art";
import { ItemStatusBadge, KitchenStatusBadge } from "@/components/ops/common";
import { OpsShell } from "@/components/ops-shell";
import { useToast } from "@/components/toast";
import {
  Button,
  ButtonLink,
  Card,
  describedBy,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatINR, formatLongDate } from "@/lib/format";
import { serverErrors } from "@/lib/forms";
import { useRouteParams } from "@/lib/route-params";

function checkAction(c: ReadinessCheck, k: KitchenDetail) {
  switch (c.key) {
    case "SELLABLE_ITEM":
      return { href: `/ops/kitchens/${k.id}/items/new`, label: "Add a delicacy" };
    case "CITY_SHIPS_OUT":
      return { href: `/ops/routes?origin=${k.city.id}`, label: `Add a route from ${k.city.name}` };
    case "OWNER_ACCOUNT":
      return { href: "#people", label: "Invite the owner" };
    default:
      return { href: `/ops/kitchens/${k.id}/edit`, label: "Edit details" };
  }
}

function Checklist({ k }: { k: KitchenDetail }) {
  const blocking = k.readiness.filter((c) => !c.ok && c.blocking).length;
  return (
    <Card className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Go-live checklist</h2>
        <p className={cn("text-sm font-semibold", blocking ? "text-warning" : "text-success")}>
          {blocking === 0
            ? k.status === "ACTIVE"
              ? "All set"
              : "Ready to go live"
            : `${blocking} ${blocking === 1 ? "thing" : "things"} left`}
        </p>
      </div>
      <ul className="divide-y divide-line">
        {k.readiness.map((c) => {
          const action = checkAction(c, k);
          const Icon = c.ok ? CheckCircle2 : c.blocking ? XCircle : AlertTriangle;
          return (
            <li key={c.key} className="flex gap-3 py-3">
              <Icon
                className={cn(
                  "mt-0.5 size-5 shrink-0",
                  c.ok ? "text-success" : c.blocking ? "text-danger" : "text-warning",
                )}
                aria-label={c.ok ? "Done:" : c.blocking ? "Needed:" : "Recommended:"}
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.label}</p>
                <p className="text-sm text-ink-soft">{c.detail}</p>
              </div>
              {!c.ok && (
                <Link
                  href={action.href}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 self-center text-sm font-semibold text-jaggery hover:underline"
                >
                  {action.label}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Delicacies({ k }: { k: KitchenDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const status = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "PAUSED" }) =>
      api.setItemStatus(id, { status }),
    onSuccess: (item) => {
      void qc.invalidateQueries({ queryKey: ["ops-kitchen", k.id] });
      toast(
        "success",
        item.status === "ACTIVE" ? `${item.name} is on sale.` : `${item.name} is paused.`,
      );
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  return (
    <Card className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Delicacies</h2>
        <ButtonLink href={`/ops/kitchens/${k.id}/items/new`} size="sm" variant="secondary">
          <Plus className="size-4" aria-hidden /> Add delicacy
        </ButtonLink>
      </div>
      {k.items.length === 0 ? (
        <EmptyState
          title="No delicacies yet"
          body="Add the first one with its pack sizes; you'll see which cities it can reach fresh as you fill it in."
        />
      ) : (
        <ul className="divide-y divide-line">
          {k.items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="size-14 shrink-0 overflow-hidden rounded-md border border-line">
                <ItemArt art={i.artKey} tempClass={i.tempClass} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/ops/items/${i.id}`}
                    className="font-semibold hover:text-jaggery hover:underline"
                  >
                    {i.name}
                  </Link>
                  <ItemStatusBadge status={i.status} />
                </div>
                <p className="text-sm text-ink-soft">
                  {i.category} · {TEMP_LABELS[i.tempClass]} · fresh{" "}
                  {formatShelfLife(i.shelfLifeHours)} · {i.variants} pack{" "}
                  {i.variants === 1 ? "size" : "sizes"}
                  {i.fromPricePaise !== null && ` · from ${formatINR(i.fromPricePaise)}`}
                </p>
              </div>
              <div className="flex gap-2">
                {i.status === "ACTIVE" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={status.isPending && status.variables?.id === i.id}
                    onClick={() => status.mutate({ id: i.id, status: "PAUSED" })}
                  >
                    Pause
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={i.variants === 0}
                    loading={status.isPending && status.variables?.id === i.id}
                    onClick={() => status.mutate({ id: i.id, status: "ACTIVE" })}
                  >
                    Put on sale
                  </Button>
                )}
                <ButtonLink
                  href={`/ops/items/${i.id}`}
                  size="sm"
                  variant="ghost"
                  aria-label={`Edit ${i.name}`}
                >
                  <Pencil className="size-4" aria-hidden /> Edit
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function People({ k }: { k: KitchenDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const id = useId();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    role: "VENDOR_STAFF" as "VENDOR_OWNER" | "VENDOR_STAFF",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const add = useMutation({
    mutationFn: () => api.addKitchenMember(k.id, form),
    onSuccess: (detail) => {
      qc.setQueryData(["ops-kitchen", k.id], detail);
      setForm({ name: "", phone: "", role: "VENDOR_STAFF" });
      setErrors({});
      toast("success", "Invited. They can sign in with that number now.");
    },
    onError: (e) => {
      const { fields, message } = serverErrors(e, { INVALID_PHONE: "phone" });
      setErrors({ ...fields, ...(message ? { form: message } : {}) });
    },
  });
  return (
    <Card className="p-4 md:p-6" id="people">
      <h2 className="mb-3 text-xl font-bold">People</h2>
      <ul className="mb-4 divide-y divide-line">
        {k.members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span>
              <span className="font-semibold">{m.name ?? "Invited"}</span>
              <span className="tabular block text-ink-muted">
                {m.phone ?? "Signed in with another number"}
              </span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              {m.role === "VENDOR_OWNER" ? "Owner" : "Staff"}
            </span>
          </li>
        ))}
      </ul>
      <form
        className="grid gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <p className="flex items-center gap-2 text-sm font-semibold">
          <UserPlus className="size-4 text-jaggery" aria-hidden /> Invite someone
        </p>
        <Field label="Name" htmlFor={`${id}-name`} error={errors.name}>
          <Input
            id={`${id}-name`}
            value={form.name}
            autoComplete="off"
            aria-invalid={Boolean(errors.name) || undefined}
            aria-describedby={describedBy(`${id}-name`, { error: errors.name })}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field label="Mobile" htmlFor={`${id}-phone`} error={errors.phone}>
            <Input
              id={`${id}-phone`}
              type="tel"
              inputMode="tel"
              value={form.phone}
              aria-invalid={Boolean(errors.phone) || undefined}
              aria-describedby={describedBy(`${id}-phone`, { error: errors.phone })}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Role" htmlFor={`${id}-role`}>
            <Select
              id={`${id}-role`}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}
            >
              <option value="VENDOR_STAFF">Staff</option>
              <option value="VENDOR_OWNER">Owner</option>
            </Select>
          </Field>
        </div>
        {errors.form && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {errors.form}
          </p>
        )}
        <Button type="submit" variant="secondary" loading={add.isPending}>
          Send invite
        </Button>
      </form>
    </Card>
  );
}

function Details({ k }: { k: KitchenDetail }) {
  const rows: [string, string][] = [
    [
      "Pickup",
      `${k.pickupAddress.line1}${k.pickupAddress.line2 ? `, ${k.pickupAddress.line2}` : ""} · ${k.pickupPincode}`,
    ],
    ["Dispatch contact", `${k.pickupAddress.contactName} · ${k.pickupAddress.contactPhone}`],
    ["FSSAI", `${k.fssaiLicenseNo} · until ${formatLongDate(k.fssaiValidUntil)}`],
    ["GSTIN", k.gstin ?? "—"],
    ["Dispatch days", describeWeekdays(k.dispatchWeekdays)],
    [
      "Schedule",
      `Orders close ${k.orderCutoffLocal}, ${k.prepLeadDays} day(s) before · cooking from ${k.prepStartLocal} · ready ${k.readyForPickupLocal}`,
    ],
    ["Capacity", `Up to ${k.dailyShipmentCap} parcels a day`],
    ["Commission", `${k.commissionBps / 100}%`],
    ["Payouts", k.payoutAccountRef ? `Razorpay Route ${k.payoutAccountRef}` : "Not linked yet"],
  ];
  return (
    <Card className="p-4 md:p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Details</h2>
        <ButtonLink href={`/ops/kitchens/${k.id}/edit`} size="sm" variant="ghost">
          <Pencil className="size-4" aria-hidden /> Edit
        </ButtonLink>
      </div>
      <dl className="grid gap-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              {label}
            </dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <Link
        href={`/ops/payouts?kitchen=${k.id}`}
        className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-jaggery hover:underline"
      >
        View payouts <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Card>
  );
}

function Kitchen() {
  const { id } = useRouteParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const kitchen = useQuery({ queryKey: ["ops-kitchen", id], queryFn: () => api.kitchen(id) });
  const status = useMutation({
    mutationFn: (to: "ACTIVE" | "PAUSED") => api.updateVendor(id, { status: to }),
    onSuccess: (_list, to) => {
      void qc.invalidateQueries({ queryKey: ["ops-kitchen", id] });
      void qc.invalidateQueries({ queryKey: ["ops-vendors"] });
      toast(
        "success",
        to === "ACTIVE" ? "Live — shoppers can order now." : "Paused. Existing orders still ship.",
      );
    },
    onError: (e) => {
      toast("error", e instanceof ApiError ? e.message : "Couldn't change the status.");
      void qc.invalidateQueries({ queryKey: ["ops-kitchen", id] });
    },
  });
  const k = kitchen.data;
  if (kitchen.isError) {
    return (
      <EmptyState
        title="Kitchen not found"
        action={<ButtonLink href="/ops/kitchens">All kitchens</ButtonLink>}
      />
    );
  }
  if (!k) return <Skeleton className="h-96" />;
  return (
    <>
      <Link
        href="/ops/kitchens"
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-jaggery"
      >
        <ArrowLeft className="size-4" aria-hidden /> Kitchens
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold">{k.name}</h1>
            <KitchenStatusBadge status={k.status} />
          </div>
          <p className="text-ink-soft">
            {k.city.name}
            {k.establishedYear ? ` · since ${k.establishedYear}` : ""}
            {k.tagline ? ` · ${k.tagline}` : ""}
          </p>
          {k.status === "ACTIVE" && (
            <Link
              href={`/kitchens/${k.slug}`}
              className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-jaggery hover:underline"
            >
              View on the storefront <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {k.status === "ACTIVE" ? (
            <Button
              variant="secondary"
              loading={status.isPending}
              onClick={() => status.mutate("PAUSED")}
            >
              Pause kitchen
            </Button>
          ) : (
            <Button
              loading={status.isPending}
              disabled={!k.readyToGoLive}
              aria-describedby={k.readyToGoLive ? undefined : "go-live-hint"}
              onClick={() => status.mutate("ACTIVE")}
            >
              {k.status === "PAUSED" ? "Resume kitchen" : "Go live"}
            </Button>
          )}
        </div>
      </div>
      {!k.readyToGoLive && k.status !== "ACTIVE" && (
        <p id="go-live-hint" className="-mt-4 mb-6 text-sm text-ink-muted">
          Finish the checklist to go live.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid content-start gap-6">
          <Checklist k={k} />
          <Delicacies k={k} />
        </div>
        <div className="grid content-start gap-6">
          <People k={k} />
          <Details k={k} />
        </div>
      </div>
    </>
  );
}

export function KitchenPage() {
  return (
    <OpsShell>
      <Kitchen />
    </OpsShell>
  );
}
