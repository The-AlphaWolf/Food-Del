"use client";

import type { Route } from "@food-del/domain/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pencil, Plane, Plus, Route as RouteIcon, Truck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useOnboardingOptions } from "@/components/ops/common";
import { MODE_LABELS, RouteForm } from "@/components/ops/route-form";
import { OpsShell } from "@/components/ops-shell";
import { useToast } from "@/components/toast";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Button, Card, EmptyState, Select, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

const routeKey = (r: Route) =>
  `${r.originCityId}|${r.destinationCityId}|${r.carrierCode}|${r.mode}`;

function RouteRow({ r, onEdit }: { r: Route; onEdit: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toggle = useMutation({
    mutationFn: () =>
      api.saveRoute({
        originCityId: r.originCityId,
        destinationCityId: r.destinationCityId,
        carrierCode: r.carrierCode,
        mode: r.mode,
        transitHoursP50: r.transitHoursP50,
        transitHoursP90: r.transitHoursP90,
        pickupCutoffLocal: r.pickupCutoffLocal,
        deliversSunday: r.deliversSunday,
        acceptsDryIce: r.acceptsDryIce,
        rateZone: r.rateZone,
        isActive: !r.isActive,
      }),
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ["ops-routes"] });
      toast(
        "success",
        `${saved.origin.name} → ${saved.destination.name} ${saved.isActive ? "resumed" : "paused"}.`,
      );
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  const uncovered = r.destinationPincodes - r.pincodes;
  const Mode = r.mode === "AIR_EXPRESS" ? Plane : Truck;
  return (
    <li
      className={cn(
        "grid gap-3 py-3 md:grid-cols-[minmax(10rem,1fr)_minmax(14rem,1.4fr)_auto] md:items-center",
        !r.isActive && "opacity-70",
      )}
    >
      <div>
        <p className="font-semibold">{r.destination.name}</p>
        <p className="flex items-center gap-1.5 text-sm text-ink-soft">
          <Mode className="size-4" aria-hidden />
          {MODE_LABELS[r.mode]} · {r.carrierCode} · zone {r.rateZone}
        </p>
      </div>
      <div className="tabular text-sm">
        <p>
          Usually <strong>{r.transitHoursP50} h</strong>, at most{" "}
          <strong>{r.transitHoursP90} h</strong>
          {!r.uniform && <span className="text-ink-muted"> (slowest pincode)</span>}
        </p>
        <p className="text-ink-soft">
          Pickup by {r.pickupCutoffLocal}
          {r.deliversSunday && " · delivers Sundays"} · {r.activePincodes} of{" "}
          {r.destinationPincodes} pincodes live
        </p>
        {uncovered > 0 && (
          <p className="mt-1 flex items-center gap-1 font-semibold text-warning">
            <AlertTriangle className="size-4" aria-hidden /> {uncovered} new pincodes not covered —
            save to extend
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!r.isActive && <Badge tone="warning">Paused</Badge>}
        <Button
          size="sm"
          variant="secondary"
          loading={toggle.isPending}
          onClick={() => toggle.mutate()}
        >
          {r.isActive ? "Pause" : "Resume"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onEdit}
          aria-label={`Edit ${r.origin.name} to ${r.destination.name} ${MODE_LABELS[r.mode]}`}
        >
          <Pencil className="size-4" aria-hidden /> Edit
        </Button>
      </div>
    </li>
  );
}

function Routes() {
  const router = useRouter();
  const params = useSearchParams();
  const origin = params.get("origin") ?? "";
  const options = useOnboardingOptions();
  const routes = useQuery({ queryKey: ["ops-routes"], queryFn: () => api.routes() });
  const [editing, setEditing] = useState<Route | "new" | null>(null);

  const origins = (options.data?.cities ?? []).filter((c) => c.isOrigin);
  const shown = (routes.data ?? []).filter((r) => !origin || r.originCityId === origin);
  const groups = origins
    .filter((c) => !origin || c.id === origin)
    .map((c) => ({ city: c, routes: shown.filter((r) => r.originCityId === c.id) }));

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Routes</h1>
          <p className="max-w-2xl text-ink-soft">
            One courier service from a kitchen city to every pincode of another. Delivery dates,
            freshness checks and shipping prices all come from these.
          </p>
        </div>
        <Button onClick={() => setEditing("new")} disabled={!options.data}>
          <Plus className="size-4" aria-hidden /> Add route
        </Button>
      </div>
      <div className="mb-6 max-w-xs">
        <label htmlFor="route-origin" className="mb-1.5 block text-sm font-semibold">
          From
        </label>
        <Select
          id="route-origin"
          value={origin}
          onChange={(e) =>
            router.replace(e.target.value ? `/ops/routes?origin=${e.target.value}` : "/ops/routes")
          }
        >
          <option value="">All kitchen cities</option>
          {origins.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      {!routes.data || !options.data ? (
        <Skeleton className="h-96" />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<RouteIcon className="size-8" />}
          title="No kitchen cities yet"
          body="Mark a city as an origin under Cities, then add routes from it."
        />
      ) : (
        <div className="grid gap-6">
          {groups.map(({ city, routes: list }) => (
            <Card key={city.id} className="p-4 md:p-6">
              <section aria-labelledby={`from-${city.slug}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 id={`from-${city.slug}`} className="text-xl font-bold">
                    From {city.name}
                  </h2>
                  <p className="text-sm text-ink-muted">
                    {new Set(list.filter((r) => r.isActive).map((r) => r.destinationCityId)).size}{" "}
                    cities served
                  </p>
                </div>
                {list.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-paper-deep p-4 text-sm">
                    <p>No routes yet — kitchens here can't ship anywhere.</p>
                    <Button size="sm" onClick={() => setEditing("new")}>
                      Add the first route
                    </Button>
                  </div>
                ) : (
                  <ul className="divide-y divide-line">
                    {list.map((r) => (
                      <RouteRow key={routeKey(r)} r={r} onEdit={() => setEditing(r)} />
                    ))}
                  </ul>
                )}
              </section>
            </Card>
          ))}
        </div>
      )}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing && editing !== "new" ? "Edit route" : "Add a route"}
        description="Applies to every pincode of the destination city, immediately."
      >
        {options.data && editing !== null && (
          <RouteForm
            options={options.data}
            route={editing === "new" ? undefined : editing}
            defaultOrigin={origin || undefined}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </>
  );
}

export default function RoutesPage() {
  return (
    <OpsShell>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Routes />
      </Suspense>
    </OpsShell>
  );
}
