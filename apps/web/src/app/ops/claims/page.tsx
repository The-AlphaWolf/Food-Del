"use client";

import type { Claim } from "@food-del/domain/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OpsShell } from "@/components/ops-shell";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { formatDateTime, formatINR } from "@/lib/format";

function ClaimRow({ c }: { c: Claim }) {
  const qc = useQueryClient();
  const toast = useToast();
  const resolve = useMutation({
    mutationFn: (body: Parameters<typeof api.resolveClaim>[1]) => api.resolveClaim(c.id, body),
    onSuccess: (r) => {
      toast(
        "success",
        r.status === "APPROVED" ? `Refunded ${formatINR(r.refundPaise)}` : "Claim rejected",
      );
      void qc.invalidateQueries({ queryKey: ["ops-claims"] });
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  return (
    <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="flex items-center gap-2 font-semibold">
          <span className="tabular">{c.orderNumber}</span>
          <Badge
            tone={c.status === "OPEN" ? "warning" : c.status === "APPROVED" ? "success" : "neutral"}
          >
            {c.status.toLowerCase()}
          </Badge>
          <Badge>{c.kind.toLowerCase().replace(/_/g, " ")}</Badge>
        </p>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{c.description}</p>
        <p className="text-xs text-ink-muted">
          {formatDateTime(c.createdAt)}
          {c.refundPaise ? ` · refunded ${formatINR(c.refundPaise)}` : ""}
        </p>
      </div>
      {c.status === "OPEN" && (
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            loading={resolve.isPending}
            onClick={() => resolve.mutate({ decision: "APPROVED", resolution: "REFUND" })}
          >
            Refund in full
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              resolve.mutate({
                decision: "REJECTED",
                resolution: "NONE",
                note: window.prompt("Reason (shared with the customer)") ?? undefined,
              })
            }
          >
            Reject
          </Button>
        </div>
      )}
    </li>
  );
}

function Claims() {
  const claims = useQuery({ queryKey: ["ops-claims"], queryFn: () => api.opsClaims() });
  return (
    <>
      <h1 className="mb-4 text-3xl font-extrabold">Quality claims</h1>
      {!claims.data ? (
        <Skeleton className="h-64" />
      ) : claims.data.length === 0 ? (
        <EmptyState
          title="No claims"
          body="Customers can report a problem within 24 hours of delivery."
        />
      ) : (
        <Card className="px-4">
          <ul className="divide-y divide-line">
            {claims.data.map((c) => (
              <ClaimRow key={c.id} c={c} />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

export default function OpsClaimsPage() {
  return (
    <OpsShell>
      <Claims />
    </OpsShell>
  );
}
