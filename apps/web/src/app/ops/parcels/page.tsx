"use client";

import { SHIPMENT_STATUS_LABELS, SHIPMENT_STATUSES } from "@food-del/domain";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { OpsShell } from "@/components/ops-shell";
import { OpsShipmentsTable } from "@/components/ops-shipments-table";
import { Card, Input, Select, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";

function Parcels() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [date, setDate] = useState("");
  const rows = useQuery({
    queryKey: ["ops-parcels", status, q, date],
    queryFn: () =>
      api.opsShipments({
        status: status || undefined,
        q: q || undefined,
        dispatchDate: date || undefined,
      }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <h1 className="mb-4 text-3xl font-extrabold">Parcels</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="ops-q">
          Search
        </label>
        <Input
          id="ops-q"
          placeholder="Order number, AWB or kitchen"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-72"
        />
        <label className="sr-only" htmlFor="ops-status">
          Status
        </label>
        <Select
          id="ops-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-56"
        >
          <option value="">Any status</option>
          {SHIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SHIPMENT_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="ops-date">
          Dispatch date
        </label>
        <Input
          id="ops-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-48"
        />
      </div>
      <Card>
        {rows.data ? <OpsShipmentsTable rows={rows.data} /> : <Skeleton className="h-64" />}
      </Card>
    </>
  );
}

export default function OpsParcelsPage() {
  return (
    <OpsShell>
      <Parcels />
    </OpsShell>
  );
}
