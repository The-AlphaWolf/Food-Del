"use client";

import type { OpsCity, OpsVendor } from "@food-del/domain/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OpsShell } from "@/components/ops-shell";
import { useToast } from "@/components/toast";
import { Badge, Card, Select, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { formatLocalDate } from "@/lib/format";

function Network() {
  const qc = useQueryClient();
  const toast = useToast();
  const cities = useQuery({ queryKey: ["ops-cities"], queryFn: api.opsCities });
  const vendors = useQuery({ queryKey: ["ops-vendors"], queryFn: api.opsVendors });
  const updateCity = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<OpsCity> }) =>
      api.updateCity(id, patch),
    onSuccess: (list) => {
      qc.setQueryData(["ops-cities"], list);
      toast("success", "City updated — live for shoppers immediately.");
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  const updateVendor = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<OpsVendor> }) =>
      api.updateVendor(id, patch),
    onSuccess: (list) => {
      qc.setQueryData(["ops-vendors"], list);
      toast("success", "Kitchen updated.");
    },
  });
  return (
    <>
      <h1 className="mb-1 text-3xl font-extrabold">Cities &amp; kitchens</h1>
      <p className="mb-6 text-ink-soft">
        Launching a city is a data change: map its pincodes, load lanes, then set it live.
      </p>
      <Card className="mb-8 overflow-x-auto">
        {!cities.data ? (
          <Skeleton className="h-48" />
        ) : (
          <table className="tabular w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
                <th scope="col" className="p-3">
                  City
                </th>
                <th scope="col" className="p-3">
                  Pincodes
                </th>
                <th scope="col" className="p-3">
                  Kitchens
                </th>
                <th scope="col" className="p-3">
                  Lanes out
                </th>
                <th scope="col" className="p-3">
                  Role
                </th>
                <th scope="col" className="p-3">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {cities.data.map((c) => (
                <tr key={c.id} className="border-b border-line">
                  <th scope="row" className="p-3 text-left font-semibold">
                    {c.name} <span className="font-normal text-ink-muted">{c.stateCode}</span>
                  </th>
                  <td className="p-3">{c.pincodes}</td>
                  <td className="p-3">{c.vendors}</td>
                  <td className="p-3">{c.lanesFrom}</td>
                  <td className="p-3">
                    <label className="mr-3 inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={c.isOrigin}
                        onChange={(e) =>
                          updateCity.mutate({ id: c.id, patch: { isOrigin: e.target.checked } })
                        }
                        className="accent-[var(--color-jaggery)]"
                      />
                      origin
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={c.isDestination}
                        onChange={(e) =>
                          updateCity.mutate({
                            id: c.id,
                            patch: { isDestination: e.target.checked },
                          })
                        }
                        className="accent-[var(--color-jaggery)]"
                      />
                      destination
                    </label>
                  </td>
                  <td className="p-3">
                    <Select
                      aria-label={`${c.name} launch status`}
                      value={c.launchStatus}
                      onChange={(e) =>
                        updateCity.mutate({
                          id: c.id,
                          patch: { launchStatus: e.target.value as OpsCity["launchStatus"] },
                        })
                      }
                      className="h-9 w-36"
                    >
                      {["HIDDEN", "COMING_SOON", "LIVE", "PAUSED"].map((s) => (
                        <option key={s} value={s}>
                          {s.toLowerCase().replace("_", " ")}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <h2 className="mb-3 text-2xl font-bold">Kitchens</h2>
      <Card className="overflow-x-auto">
        {!vendors.data ? (
          <Skeleton className="h-48" />
        ) : (
          <table className="tabular w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
                <th scope="col" className="p-3">
                  Kitchen
                </th>
                <th scope="col" className="p-3">
                  FSSAI
                </th>
                <th scope="col" className="p-3">
                  Items
                </th>
                <th scope="col" className="p-3">
                  30-day parcels
                </th>
                <th scope="col" className="p-3">
                  Failure rate
                </th>
                <th scope="col" className="p-3">
                  Commission
                </th>
                <th scope="col" className="p-3">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {vendors.data.map((v) => (
                <tr key={v.id} className="border-b border-line">
                  <th scope="row" className="p-3 text-left font-semibold">
                    {v.name}
                    <span className="block text-xs font-normal text-ink-muted">{v.city}</span>
                  </th>
                  <td className="p-3">
                    {v.fssaiLicenseNo}
                    {v.fssaiExpiringSoon ? (
                      <Badge tone="warning" className="ml-2">
                        expires {formatLocalDate(v.fssaiValidUntil)}
                      </Badge>
                    ) : null}
                  </td>
                  <td className="p-3">{v.activeItems}</td>
                  <td className="p-3">{v.shipmentsLast30d}</td>
                  <td className="p-3">
                    {v.failureRateLast30d === null
                      ? "—"
                      : `${Math.round(v.failureRateLast30d * 100)}%`}
                  </td>
                  <td className="p-3">{v.commissionBps / 100}%</td>
                  <td className="p-3">
                    <Select
                      aria-label={`${v.name} status`}
                      value={v.status}
                      onChange={(e) =>
                        updateVendor.mutate({
                          id: v.id,
                          patch: { status: e.target.value as OpsVendor["status"] },
                        })
                      }
                      className="h-9 w-36"
                    >
                      {["ONBOARDING", "ACTIVE", "PAUSED", "OFFBOARDED"].map((s) => (
                        <option key={s} value={s}>
                          {s.toLowerCase()}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

export default function OpsNetworkPage() {
  return (
    <OpsShell>
      <Network />
    </OpsShell>
  );
}
