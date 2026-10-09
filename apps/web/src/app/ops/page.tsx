"use client";

import { JOB_NAMES, type JobName } from "@food-del/domain/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChefHat,
  Clock,
  Inbox,
  Plane,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { OpsShell } from "@/components/ops-shell";
import { OpsShipmentsTable } from "@/components/ops-shipments-table";
import { useToast } from "@/components/toast";
import { Button, Card, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { formatDateTime, formatINR } from "@/lib/format";

function Tile({
  label,
  value,
  icon: Icon,
  tone = "text-ink",
}: {
  label: string;
  value: string | number;
  icon: typeof Clock;
  tone?: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <Icon className={`size-6 ${tone}`} aria-hidden />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
        <p className={`tabular text-2xl font-bold ${tone}`}>{value}</p>
      </div>
    </Card>
  );
}

/** What each scheduled job does, in ops language. Vercel Cron runs them; these buttons run one now. */
const JOB_LABELS: Record<JobName, string> = {
  "lock-batches": "Lock batches at cutoff",
  "expire-holds": "Release unpaid holds",
  "monitor-at-risk": "Check at-risk parcels",
  "release-payouts": "Release payouts",
  "materialize-slots": "Open order book",
  "process-outbox": "Send queued work",
};

function Overview() {
  const qc = useQueryClient();
  const toast = useToast();
  const overview = useQuery({
    queryKey: ["ops-overview"],
    queryFn: api.opsOverview,
    refetchInterval: 30_000,
  });
  const run = useMutation({
    mutationFn: (job: JobName) => api.runJob(job),
    onSuccess: (r) => {
      toast("success", `${JOB_LABELS[r.job]}: ${r.processed} done`);
      void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("ops") });
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  const o = overview.data;
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Operations</h1>
          {o && (
            <p className="text-sm text-ink-muted">
              As of {formatDateTime(o.asOf)} · refreshes every 30 s
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="run-now">
          <span id="run-now" className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            Run now
          </span>
          {JOB_NAMES.map((j) => (
            <Button
              key={j}
              size="sm"
              variant="secondary"
              loading={run.isPending && run.variables === j}
              onClick={() => run.mutate(j)}
            >
              <RotateCcw className="size-3.5" aria-hidden /> {JOB_LABELS[j]}
            </Button>
          ))}
        </div>
      </div>
      {!o ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="At risk"
              value={o.counts.atRisk}
              icon={AlertTriangle}
              tone={o.counts.atRisk ? "text-warning" : "text-ink"}
            />
            <Tile label="In the air / on road" value={o.counts.inFlight} icon={Plane} />
            <Tile label="In kitchens" value={o.counts.inKitchen + o.counts.placed} icon={ChefHat} />
            <Tile
              label="Delivered (7 d)"
              value={o.counts.deliveredLast7d}
              icon={CheckCircle2}
              tone="text-success"
            />
            <Tile
              label="Failed attempts"
              value={o.counts.deliveryAttemptsFailed}
              icon={Clock}
              tone={o.counts.deliveryAttemptsFailed ? "text-warning" : "text-ink"}
            />
            <Tile label="Open claims" value={o.counts.openClaims} icon={Inbox} />
            <Tile label="GMV (7 d)" value={formatINR(o.gmvLast7dPaise)} icon={Wallet} />
            <Tile
              label="On time (30 d)"
              value={
                o.onTimeRateLast30d === null ? "—" : `${Math.round(o.onTimeRateLast30d * 100)}%`
              }
              icon={CheckCircle2}
            />
          </div>
          {(o.counts.outboxFailed > 0 || o.counts.outboxPending > 20) && (
            <p
              className="mb-6 rounded-md bg-warning-soft p-3 text-sm font-semibold text-warning"
              role="alert"
            >
              Queued work: {o.counts.outboxPending} waiting, {o.counts.outboxFailed} failed. Run “
              {JOB_LABELS["process-outbox"]}” or check the payment, courier and messaging keys.
            </p>
          )}
          <Card>
            <h2 className="border-b border-line p-4 font-sans text-lg font-bold">
              Exception queue ({o.exceptions.length})
            </h2>
            <OpsShipmentsTable
              rows={o.exceptions}
              empty={
                <p className="flex items-center justify-center gap-2 py-8 text-sm font-semibold text-success">
                  <CheckCircle2 className="size-5" aria-hidden /> No exceptions — every parcel is on
                  track.
                </p>
              }
            />
          </Card>
        </>
      )}
    </>
  );
}

export default function OpsPage() {
  return (
    <OpsShell>
      <Overview />
    </OpsShell>
  );
}
