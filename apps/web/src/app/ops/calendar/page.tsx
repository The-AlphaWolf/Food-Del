"use client";

import { BLACKOUT_SCOPE_VALUES } from "@food-del/domain/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { OpsShell } from "@/components/ops-shell";
import { useToast } from "@/components/toast";
import { Button, Card, Field, Input, Select, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { formatLocalDate } from "@/lib/format";

function Calendar() {
  const qc = useQueryClient();
  const toast = useToast();
  const blackouts = useQuery({ queryKey: ["ops-blackouts"], queryFn: api.blackouts });
  const cities = useQuery({ queryKey: ["ops-cities"], queryFn: api.opsCities });
  const vendors = useQuery({ queryKey: ["ops-vendors"], queryFn: api.opsVendors });
  const [form, setForm] = useState({
    scope: "NATIONAL" as (typeof BLACKOUT_SCOPE_VALUES)[number],
    scopeRef: "",
    date: "",
    reason: "",
  });
  const add = useMutation({
    mutationFn: () => api.addBlackout(form),
    onSuccess: (list) => {
      qc.setQueryData(["ops-blackouts"], list);
      setForm({ ...form, date: "", reason: "" });
      toast("success", "Added. Delivery calendars update immediately.");
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.removeBlackout(id),
    onSuccess: (list) => qc.setQueryData(["ops-blackouts"], list),
  });
  const refs =
    form.scope === "CITY"
      ? (cities.data ?? []).map((c) => ({ id: c.id, name: c.name }))
      : form.scope === "VENDOR"
        ? (vendors.data ?? []).map((v) => ({ id: v.id, name: v.name }))
        : form.scope === "CARRIER"
          ? [
              { id: "bluedart", name: "Blue Dart" },
              { id: "delhivery", name: "Delhivery" },
            ]
          : [];
  return (
    <>
      <h1 className="mb-1 text-3xl font-extrabold">Holidays &amp; closures</h1>
      <p className="mb-6 text-ink-soft">
        No dispatch (national, city, kitchen) or no courier movement (carrier) on these days. The
        engine skips them and explains why to shoppers.
      </p>
      <Card className="mb-6 p-4">
        <form
          className="grid gap-3 md:grid-cols-[10rem_14rem_10rem_1fr_auto] md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Field label="Scope" htmlFor="b-scope">
            <Select
              id="b-scope"
              value={form.scope}
              onChange={(e) =>
                setForm({ ...form, scope: e.target.value as typeof form.scope, scopeRef: "" })
              }
            >
              {BLACKOUT_SCOPE_VALUES.map((s) => (
                <option key={s} value={s}>
                  {s.toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Which" htmlFor="b-ref">
            <Select
              id="b-ref"
              value={form.scopeRef}
              disabled={form.scope === "NATIONAL"}
              onChange={(e) => setForm({ ...form, scopeRef: e.target.value })}
            >
              <option value="">{form.scope === "NATIONAL" ? "All of India" : "Choose…"}</option>
              {refs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="b-date">
            <Input
              id="b-date"
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>
          <Field label="Reason" htmlFor="b-reason">
            <Input
              id="b-reason"
              required
              minLength={3}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="e.g. Durga Puja (Dashami)"
            />
          </Field>
          <Button
            type="submit"
            loading={add.isPending}
            disabled={
              !form.date || form.reason.length < 3 || (form.scope !== "NATIONAL" && !form.scopeRef)
            }
          >
            Add
          </Button>
        </form>
      </Card>
      {!blackouts.data ? (
        <Skeleton className="h-64" />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {blackouts.data.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <strong>{formatLocalDate(b.date)}</strong> · {b.reason}{" "}
                  <span className="text-ink-muted">
                    ({b.scope.toLowerCase()}: {b.scopeLabel})
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${b.reason}`}
                  className="rounded p-2 text-ink-muted hover:bg-danger-soft hover:text-danger"
                  onClick={() => remove.mutate(b.id)}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

export default function OpsCalendarPage() {
  return (
    <OpsShell>
      <Calendar />
    </OpsShell>
  );
}
