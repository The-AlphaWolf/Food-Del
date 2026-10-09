"use client";

import { ApiError } from "@food-del/api-client";
import { queryKeys } from "@food-del/api-client/react";
import { isoWeekday } from "@food-del/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { KITCHEN_ROLES, RoleGate } from "@/components/role-gate";
import { useToast } from "@/components/toast";
import { Button, Card, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

const WD = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Inventory() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const grid = useQuery({
    queryKey: queryKeys.inventory(vendorId),
    queryFn: () => api.inventory(vendorId, { days: 14 }),
  });
  const [edits, setEdits] = useState<Record<string, number>>({});
  const save = useMutation({
    mutationFn: () =>
      api.updateInventory(vendorId, {
        cells: Object.entries(edits).map(([k, capacity]) => {
          const [variantId, date] = k.split("|") as [string, string];
          return { variantId, date, capacity };
        }),
      }),
    onSuccess: (g) => {
      qc.setQueryData(queryKeys.inventory(vendorId), g);
      setEdits({});
      toast("success", "Capacity saved.");
    },
    onError: (e) => toast("error", e instanceof ApiError ? e.message : "Couldn't save."),
  });
  const g = grid.data;
  return (
    <div className="container-page py-8">
      <Link href="/vendor" className="text-sm font-semibold text-jaggery">
        ← Kitchen portal
      </Link>
      <div className="mb-4 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Daily capacity</h1>
          <p className="text-ink-soft">
            How many of each pack you can make per dispatch day. Sold and held units are shown under
            each cap.
          </p>
        </div>
        <Button
          loading={save.isPending}
          disabled={Object.keys(edits).length === 0}
          onClick={() => save.mutate()}
        >
          Save {Object.keys(edits).length || ""} change{Object.keys(edits).length === 1 ? "" : "s"}
        </Button>
      </div>
      {!g ? (
        <Skeleton className="h-96" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="tabular w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-paper">
                <th scope="col" className="sticky left-0 bg-paper p-3 text-left">
                  Item
                </th>
                {g.dates.map((d) => (
                  <th
                    key={d}
                    scope="col"
                    className={cn(
                      "p-2 text-center text-xs",
                      isoWeekday(d) === 7 && "text-ink-muted",
                    )}
                  >
                    {WD[isoWeekday(d)]}
                    <br />
                    {d.slice(8)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.variantId} className="border-b border-line">
                  <th scope="row" className="sticky left-0 bg-card p-3 text-left font-semibold">
                    {r.itemName}
                    <span className="block text-xs font-normal text-ink-muted">
                      {r.variantLabel}
                    </span>
                  </th>
                  {r.cells.map((c, i) => {
                    const date = g.dates[i]!;
                    const key = `${r.variantId}|${date}`;
                    if (!c && edits[key] === undefined) {
                      return (
                        <td key={date} className="p-1 text-center text-xs text-ink-muted">
                          closed
                        </td>
                      );
                    }
                    const used = (c?.sold ?? 0) + (c?.reserved ?? 0);
                    return (
                      <td key={date} className="p-1 text-center">
                        <input
                          aria-label={`${r.itemName} ${r.variantLabel} capacity on ${date}`}
                          type="number"
                          min={used}
                          max={10000}
                          inputMode="numeric"
                          value={edits[key] ?? c?.capacity ?? 0}
                          onChange={(e) =>
                            setEdits({ ...edits, [key]: Math.max(0, Number(e.target.value)) })
                          }
                          className={cn(
                            "h-9 w-14 rounded border border-line-strong bg-card text-center",
                            edits[key] !== undefined && "border-jaggery bg-saffron-soft",
                          )}
                        />
                        <span
                          className={cn(
                            "block text-[10px]",
                            used > 0 ? "font-bold text-jaggery" : "text-ink-muted",
                          )}
                        >
                          {used} used
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <RoleGate roles={KITCHEN_ROLES} title="Kitchen sign-in">
      <Inventory />
    </RoleGate>
  );
}
