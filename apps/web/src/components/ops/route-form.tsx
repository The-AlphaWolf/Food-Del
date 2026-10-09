"use client";

import { type OnboardingOptions, type Route, RouteInputSchema } from "@food-del/domain/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { type FieldErrors, fieldId, issuesFor, serverErrors, summaryOf } from "@/lib/forms";
import { useToast } from "../toast";
import { ErrorSummary } from "../ui/error-summary";
import { Button, describedBy, Field, Input, Select } from "../ui/primitives";

const FORM = "route";
const ORDER = [
  "originCityId",
  "destinationCityId",
  "carrierCode",
  "rateZone",
  "transitHoursP50",
  "transitHoursP90",
  "pickupCutoffLocal",
];
const MESSAGES: Record<string, string> = {
  originCityId: "Choose where parcels leave from.",
  destinationCityId: "Choose where they're delivered.",
  carrierCode: "Choose a courier service.",
  rateZone: "Choose the rate zone from the courier's rate card.",
  transitHoursP50: "Enter the typical door-to-door time in hours.",
  transitHoursP90: "Enter the slow-day time in hours.",
  pickupCutoffLocal: "Enter a time, like 15:00.",
};
const CODE_FIELDS = {
  RATE_CARD_MISSING: "rateZone",
  ORIGIN_NOT_ENABLED: "originCityId",
  DESTINATION_NOT_ENABLED: "destinationCityId",
  NO_PINCODES: "destinationCityId",
};

export const MODE_LABELS = { AIR_EXPRESS: "Air", SURFACE_EXPRESS: "Road" } as const;

/** Add or edit one courier service between two cities. */
export function RouteForm({
  options,
  route,
  defaultOrigin,
  onDone,
}: {
  options: OnboardingOptions;
  route?: Route;
  defaultOrigin?: string;
  onDone: (saved: Route) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const editing = Boolean(route);
  const [d, setD] = useState({
    originCityId: route?.originCityId ?? defaultOrigin ?? "",
    destinationCityId: route?.destinationCityId ?? "",
    service: route ? `${route.carrierCode}|${route.mode}` : "",
    rateZone: route?.rateZone ?? "",
    transitHoursP50: route ? String(route.transitHoursP50) : "",
    transitHoursP90: route ? String(route.transitHoursP90) : "",
    pickupCutoffLocal: route?.pickupCutoffLocal ?? "15:00",
    deliversSunday: route?.deliversSunday ?? false,
    acceptsDryIce: route?.acceptsDryIce ?? false,
    isActive: route?.isActive ?? true,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));

  const services = options.carriers.flatMap((c) =>
    c.modes.map((m) => ({
      key: `${c.code}|${m.mode}`,
      carrier: c.code,
      mode: m.mode,
      zones: m.zones,
    })),
  );
  const service = services.find((s) => s.key === d.service);
  const origins = options.cities.filter((c) => c.isOrigin);
  const destinations = options.cities.filter((c) => c.isDestination && c.id !== d.originCityId);
  const input = () => ({
    originCityId: d.originCityId,
    destinationCityId: d.destinationCityId,
    carrierCode: service?.carrier ?? "",
    mode: service?.mode ?? "AIR_EXPRESS",
    transitHoursP50: d.transitHoursP50.trim() ? Number(d.transitHoursP50) : Number.NaN,
    transitHoursP90: d.transitHoursP90.trim() ? Number(d.transitHoursP90) : Number.NaN,
    pickupCutoffLocal: d.pickupCutoffLocal,
    deliversSunday: d.deliversSunday,
    acceptsDryIce: d.acceptsDryIce,
    rateZone: d.rateZone,
    isActive: d.isActive,
  });

  const save = useMutation({
    mutationFn: () => api.saveRoute(input()),
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ["ops-routes"] });
      void qc.invalidateQueries({ queryKey: ["ops-cities"] });
      toast(
        "success",
        `${saved.origin.name} → ${saved.destination.name} saved for ${saved.pincodes} pincodes. Delivery dates use it now.`,
      );
      onDone(saved);
    },
    onError: (e) => setErrors(serverErrors(e, CODE_FIELDS).fields),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = RouteInputSchema.safeParse(input());
    const found = issuesFor(parsed.success ? null : parsed.error, ORDER, MESSAGES);
    for (const key of ["originCityId", "destinationCityId", "rateZone"] as const) {
      if (!d[key]) found[key] = MESSAGES[key]!;
    }
    if (!service) found.carrierCode = MESSAGES.carrierCode!;
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  }

  const id = (p: string) => fieldId(FORM, p);
  const control = (p: string, hint = false) => ({
    id: id(p),
    "aria-invalid": Boolean(errors[p]) || undefined,
    "aria-describedby": describedBy(id(p), { hint: hint ? "y" : undefined, error: errors[p] }),
  });
  const field = (p: string, label: string, hint?: string) => ({
    label,
    htmlFor: id(p),
    hint,
    error: errors[p],
    announce: false,
  });
  const cityName = (cid: string) => options.cities.find((c) => c.id === cid)?.name ?? "—";

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <ErrorSummary errors={summaryOf(errors, FORM, ORDER)} />
      {editing ? (
        <p className="rounded-md bg-paper-deep p-3 text-sm">
          <span className="font-semibold">
            {cityName(d.originCityId)} → {cityName(d.destinationCityId)}
          </span>{" "}
          · {service ? `${service.carrier} ${MODE_LABELS[service.mode].toLowerCase()}` : d.service}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field {...field("originCityId", "From")}>
              <Select
                {...control("originCityId")}
                value={d.originCityId}
                onChange={(e) => set("originCityId", e.target.value)}
              >
                <option value="">Choose…</option>
                {origins.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field {...field("destinationCityId", "To", "Every pincode in the city is covered.")}>
              <Select
                {...control("destinationCityId", true)}
                value={d.destinationCityId}
                onChange={(e) => set("destinationCityId", e.target.value)}
              >
                <option value="">Choose…</option>
                {destinations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.pincodes} pincodes)
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field {...field("carrierCode", "Courier service")}>
              <Select
                {...control("carrierCode")}
                value={d.service}
                onChange={(e) => setD((x) => ({ ...x, service: e.target.value, rateZone: "" }))}
              >
                <option value="">Choose…</option>
                {services.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.carrier} · {MODE_LABELS[s.mode]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field {...field("rateZone", "Rate zone", "From the courier's rate card.")}>
              <Select
                {...control("rateZone", true)}
                value={d.rateZone}
                onChange={(e) => set("rateZone", e.target.value)}
                disabled={!service}
              >
                <option value="">{service ? "Choose…" : "Pick a service first"}</option>
                {service?.zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </>
      )}
      {editing && (
        <Field {...field("rateZone", "Rate zone")}>
          <Select
            {...control("rateZone")}
            value={d.rateZone}
            onChange={(e) => set("rateZone", e.target.value)}
          >
            {service?.zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          {...field("transitHoursP50", "Typical (hours)", "Half of parcels arrive within this.")}
        >
          <Input
            {...control("transitHoursP50", true)}
            type="number"
            min={1}
            inputMode="numeric"
            value={d.transitHoursP50}
            onChange={(e) => set("transitHoursP50", e.target.value)}
          />
        </Field>
        <Field
          {...field(
            "transitHoursP90",
            "Slow day (hours)",
            "9 in 10 arrive within this. Freshness promises use it.",
          )}
        >
          <Input
            {...control("transitHoursP90", true)}
            type="number"
            min={1}
            inputMode="numeric"
            value={d.transitHoursP90}
            onChange={(e) => set("transitHoursP90", e.target.value)}
          />
        </Field>
        <Field {...field("pickupCutoffLocal", "Pickup by", "Latest collection from the kitchen.")}>
          <Input
            {...control("pickupCutoffLocal", true)}
            type="time"
            value={d.pickupCutoffLocal}
            onChange={(e) => set("pickupCutoffLocal", e.target.value)}
          />
        </Field>
      </div>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-semibold">Options</legend>
        {(
          [
            ["deliversSunday", "Delivers on Sundays"],
            ["acceptsDryIce", "Accepts dry ice (frozen, later)"],
            ["isActive", "Active — offer this route to shoppers"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={d[key]}
              onChange={(e) => set(key, e.target.checked)}
              className="size-5 accent-[var(--color-jaggery)]"
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="submit" loading={save.isPending}>
          {editing ? "Save route" : "Add route"}
        </Button>
      </div>
    </form>
  );
}
