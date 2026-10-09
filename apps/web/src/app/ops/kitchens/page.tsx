"use client";

import type { OpsVendor } from "@food-del/domain/contracts";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChefHat, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { KitchenStatusBadge } from "@/components/ops/common";
import { OpsShell } from "@/components/ops-shell";
import { ButtonLink, EmptyState, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatLongDate } from "@/lib/format";

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "ONBOARDING", label: "Onboarding" },
  { key: "ACTIVE", label: "Live" },
  { key: "PAUSED", label: "Paused" },
] as const;

function KitchenRow({ k }: { k: OpsVendor }) {
  return (
    <li>
      <Link
        href={`/ops/kitchens/${k.id}`}
        className="group grid gap-3 rounded-lg border border-line bg-card p-4 transition-shadow duration-150 hover:shadow-card md:grid-cols-[1fr_auto_auto] md:items-center"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-bold">{k.name}</span>
            <KitchenStatusBadge status={k.status} />
          </div>
          <p className="text-sm text-ink-soft">
            {k.city} · {k.activeItems} on sale · up to {k.dailyShipmentCap} parcels a day ·{" "}
            {k.commissionBps / 100}% commission
          </p>
        </div>
        <dl className="tabular flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              30-day parcels
            </dt>
            <dd className="font-semibold">{k.shipmentsLast30d}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Failure rate
            </dt>
            <dd className="font-semibold">
              {k.failureRateLast30d === null ? "—" : `${(k.failureRateLast30d * 100).toFixed(1)}%`}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">FSSAI</dt>
            <dd
              className={cn(
                "flex items-center gap-1 font-semibold",
                k.fssaiExpiringSoon && "text-warning",
              )}
            >
              {k.fssaiExpiringSoon && (
                <AlertTriangle className="size-4" aria-label="Expiring soon:" />
              )}
              {formatLongDate(k.fssaiValidUntil)}
            </dd>
          </div>
        </dl>
        <ChevronRight
          className="hidden size-5 text-ink-muted transition-transform group-hover:translate-x-0.5 md:block"
          aria-hidden
        />
      </Link>
    </li>
  );
}

function Kitchens() {
  const vendors = useQuery({ queryKey: ["ops-vendors"], queryFn: api.opsVendors });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("ALL");
  const list = (vendors.data ?? []).filter((v) => filter === "ALL" || v.status === filter);
  const counts = Object.fromEntries(
    FILTERS.map((f) => [
      f.key,
      (vendors.data ?? []).filter((v) => f.key === "ALL" || v.status === f.key).length,
    ]),
  );
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Kitchens</h1>
          <p className="text-ink-soft">
            New kitchens start in onboarding and go live once their checklist passes.
          </p>
        </div>
        <ButtonLink href="/ops/kitchens/new">
          <Plus className="size-4" aria-hidden /> Add kitchen
        </ButtonLink>
      </div>
      <div role="group" aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-4 text-sm font-semibold transition-colors",
              filter === f.key
                ? "border-jaggery bg-jaggery text-on-jaggery"
                : "border-line-strong bg-card hover:border-jaggery",
            )}
          >
            {f.label}
            <span className="tabular text-xs opacity-80">{counts[f.key]}</span>
          </button>
        ))}
      </div>
      {!vendors.data ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<ChefHat className="size-8" />}
          title={filter === "ONBOARDING" ? "No kitchens in onboarding" : "No kitchens here"}
          body="Add a kitchen to start its onboarding checklist."
          action={<ButtonLink href="/ops/kitchens/new">Add kitchen</ButtonLink>}
        />
      ) : (
        <ul className="grid gap-3">
          {list.map((k) => (
            <KitchenRow key={k.id} k={k} />
          ))}
        </ul>
      )}
    </>
  );
}

export default function KitchensPage() {
  return (
    <OpsShell>
      <Kitchens />
    </OpsShell>
  );
}
