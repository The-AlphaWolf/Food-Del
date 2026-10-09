"use client";

import { CreateCityRequestSchema, type OpsCity } from "@food-del/domain/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPinned, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { OpsShell } from "@/components/ops-shell";
import { useToast } from "@/components/toast";
import { Dialog } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/error-summary";
import {
  Button,
  Card,
  describedBy,
  Field,
  Input,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/lib/api";
import {
  type FieldErrors,
  fieldId,
  issuesFor,
  optional,
  serverErrors,
  summaryOf,
} from "@/lib/forms";

const STATUS_LABELS: Record<OpsCity["launchStatus"], string> = {
  HIDDEN: "Hidden",
  COMING_SOON: "Coming soon",
  LIVE: "Live",
  PAUSED: "Paused",
};

const FORM = "city";
const ORDER = ["name", "stateCode", "airportIata", "districts", "pincodeRanges"];
const MESSAGES: Record<string, string> = {
  name: "Enter the city's name.",
  stateCode: "Two-letter state code, e.g. RJ.",
  airportIata: "Three-letter airport code, e.g. JAI, or leave it blank.",
};

function CityForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [d, setD] = useState({
    name: "",
    stateCode: "",
    airportIata: "",
    tagline: "",
    isOrigin: false,
    isDestination: true,
    districts: [] as string[],
    pincodeRanges: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const state = /^[A-Z]{2}$/.test(d.stateCode) ? d.stateCode : undefined;
  const districts = useQuery({
    queryKey: ["ops-districts", state],
    queryFn: () => api.directoryDistricts(state),
    enabled: Boolean(state),
  });
  const input = () => ({
    name: d.name.trim(),
    stateCode: d.stateCode,
    airportIata: optional(d.airportIata) ?? null,
    tagline: optional(d.tagline) ?? null,
    isOrigin: d.isOrigin,
    isDestination: d.isDestination,
    districts: d.districts,
    pincodeRanges: optional(d.pincodeRanges),
  });
  const create = useMutation({
    mutationFn: () => api.createCity(input()),
    onSuccess: (list) => {
      qc.setQueryData(["ops-cities"], list);
      void qc.invalidateQueries({ queryKey: ["ops-onboarding-options"] });
      toast("success", `${d.name} added as hidden. Add routes, then set it live.`);
      onDone();
    },
    onError: (e) =>
      setErrors(
        serverErrors(e, {
          SLUG_TAKEN: "name",
          NO_PINCODES: "districts",
          INVALID_PINCODES: "pincodeRanges",
        }).fields,
      ),
  });
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = CreateCityRequestSchema.safeParse(input());
    const found = issuesFor(parsed.success ? null : parsed.error, ORDER, MESSAGES);
    if (d.districts.length === 0 && !d.pincodeRanges.trim()) {
      found.districts = "Choose at least one district, or enter pincode ranges.";
    }
    setErrors(found);
    if (Object.keys(found).length === 0) create.mutate();
  }
  const id = (p: string) => fieldId(FORM, p);
  const control = (p: string, hint = false) => ({
    id: id(p),
    "aria-invalid": Boolean(errors[p]) || undefined,
    "aria-describedby": describedBy(id(p), { hint: hint ? "y" : undefined, error: errors[p] }),
  });
  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <ErrorSummary errors={summaryOf(errors, FORM, ORDER)} />
      <div className="grid gap-4 sm:grid-cols-[1fr_7rem_7rem]">
        <Field label="City" htmlFor={id("name")} error={errors.name} announce={false}>
          <Input
            {...control("name")}
            value={d.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <Field label="State" htmlFor={id("stateCode")} error={errors.stateCode} announce={false}>
          <Input
            {...control("stateCode")}
            maxLength={2}
            className="uppercase"
            placeholder="RJ"
            value={d.stateCode}
            onChange={(e) =>
              setD((x) => ({ ...x, stateCode: e.target.value.toUpperCase(), districts: [] }))
            }
          />
        </Field>
        <Field
          label="Airport"
          htmlFor={id("airportIata")}
          error={errors.airportIata}
          optional
          announce={false}
        >
          <Input
            {...control("airportIata")}
            maxLength={3}
            className="uppercase"
            placeholder="JAI"
            value={d.airportIata}
            onChange={(e) => set("airportIata", e.target.value.toUpperCase())}
          />
        </Field>
      </div>
      <Field label="Tagline" htmlFor={id("tagline")} optional announce={false}>
        <Input
          {...control("tagline")}
          value={d.tagline}
          onChange={(e) => set("tagline", e.target.value)}
        />
      </Field>
      <fieldset
        id={id("districts")}
        tabIndex={-1}
        aria-describedby={describedBy(id("districts"), { hint: "y", error: errors.districts })}
        className="grid gap-2"
      >
        <legend className="mb-1 text-sm font-semibold">Districts</legend>
        <p id={`${id("districts")}-hint`} className="text-sm text-ink-muted">
          Unassigned pincodes in the chosen districts join the city.
        </p>
        {!state ? (
          <p className="text-sm text-ink-muted">Enter the state code to see its districts.</p>
        ) : !districts.data ? (
          <Skeleton className="h-16" />
        ) : districts.data.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No unassigned pincodes in {state}. Import the pincode directory, or enter ranges below.
          </p>
        ) : (
          <div className="flex flex-wrap gap-x-4">
            {districts.data.map((dist) => (
              <label key={dist.district} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={d.districts.includes(dist.district)}
                  onChange={(e) =>
                    set(
                      "districts",
                      e.target.checked
                        ? [...d.districts, dist.district]
                        : d.districts.filter((x) => x !== dist.district),
                    )
                  }
                  className="size-5 accent-[var(--color-jaggery)]"
                />
                {dist.district} <span className="tabular text-ink-muted">({dist.pincodes})</span>
              </label>
            ))}
          </div>
        )}
        {errors.districts && (
          <p id={`${id("districts")}-error`} className="text-sm font-medium text-danger">
            {errors.districts}
          </p>
        )}
      </fieldset>
      <Field
        label="Extra pincodes"
        htmlFor={id("pincodeRanges")}
        hint="Ranges or single pincodes, e.g. 302001-302039, 303007."
        error={errors.pincodeRanges}
        optional
        announce={false}
      >
        <Input
          {...control("pincodeRanges", true)}
          className="tabular"
          value={d.pincodeRanges}
          onChange={(e) => set("pincodeRanges", e.target.value)}
        />
      </Field>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-semibold">Role</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={d.isOrigin}
            onChange={(e) => set("isOrigin", e.target.checked)}
            className="size-5 accent-[var(--color-jaggery)]"
          />
          Kitchens here ship out (origin)
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={d.isDestination}
            onChange={(e) => set("isDestination", e.target.checked)}
            className="size-5 accent-[var(--color-jaggery)]"
          />
          We deliver here (destination)
        </label>
      </fieldset>
      <div className="flex justify-end border-t border-line pt-4">
        <Button type="submit" loading={create.isPending}>
          Add city
        </Button>
      </div>
    </form>
  );
}

function Cities() {
  const qc = useQueryClient();
  const toast = useToast();
  const cities = useQuery({ queryKey: ["ops-cities"], queryFn: api.opsCities });
  const [adding, setAdding] = useState(false);
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<OpsCity> }) =>
      api.updateCity(id, patch),
    onSuccess: (list) => {
      qc.setQueryData(["ops-cities"], list);
      void qc.invalidateQueries({ queryKey: ["ops-onboarding-options"] });
      toast("success", "City updated — live for shoppers immediately.");
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Cities</h1>
          <p className="max-w-2xl text-ink-soft">
            Launching a city is a data change: add it with its pincodes, add routes, then set it
            live.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Add city
        </Button>
      </div>
      {!cities.data ? (
        <Skeleton className="h-96" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {cities.data.map((c) => (
            <li key={c.id}>
              <Card className="grid h-full gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-bold">
                      {c.name}{" "}
                      <span className="font-sans text-sm font-semibold text-ink-muted">
                        {c.stateCode}
                      </span>
                    </p>
                    <p className="tabular text-sm text-ink-soft">
                      {c.pincodes} pincodes · {c.vendors} kitchens ·{" "}
                      <Link
                        href={`/ops/routes?origin=${c.id}`}
                        className="font-semibold text-jaggery hover:underline"
                      >
                        {c.lanesFrom > 0 ? "routes out" : "no routes out"}
                      </Link>
                    </p>
                  </div>
                  <MapPinned className="size-5 shrink-0 text-jaggery" aria-hidden />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-x-4">
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={c.isOrigin}
                        onChange={(e) =>
                          update.mutate({ id: c.id, patch: { isOrigin: e.target.checked } })
                        }
                        className="size-5 accent-[var(--color-jaggery)]"
                      />
                      Ships out
                    </label>
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={c.isDestination}
                        onChange={(e) =>
                          update.mutate({ id: c.id, patch: { isDestination: e.target.checked } })
                        }
                        className="size-5 accent-[var(--color-jaggery)]"
                      />
                      Receives
                    </label>
                  </div>
                  <Select
                    aria-label={`${c.name} launch status`}
                    value={c.launchStatus}
                    onChange={(e) =>
                      update.mutate({
                        id: c.id,
                        patch: { launchStatus: e.target.value as OpsCity["launchStatus"] },
                      })
                    }
                    className="w-40"
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a city"
        description="It starts hidden, so nothing changes for shoppers until you set it live."
      >
        <CityForm onDone={() => setAdding(false)} />
      </Dialog>
    </>
  );
}

export default function CitiesPage() {
  return (
    <OpsShell>
      <Cities />
    </OpsShell>
  );
}
