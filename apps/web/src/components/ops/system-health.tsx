"use client";

import type { JobName, SystemHealth } from "@food-del/domain/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertOctagon,
  CheckCircle2,
  CircleDashed,
  Clock,
  type LucideIcon,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { formatDateTime, relativeHours } from "@/lib/format";

/** What each scheduled job does, in ops language. Vercel Cron runs them; ops can run one now. */
export const JOB_LABELS: Record<JobName, string> = {
  "lock-batches": "Lock batches at cutoff",
  "expire-holds": "Release unpaid holds",
  "monitor-at-risk": "Check at-risk parcels",
  "release-payouts": "Release payouts",
  "materialize-slots": "Open order book",
  "process-outbox": "Send queued work",
  housekeeping: "Tidy up old records",
};

type JobHealth = SystemHealth["jobs"][number]["health"];
const HEALTH_LOOK: Record<
  JobHealth,
  { label: string; tone: "success" | "warning" | "danger" | "neutral"; icon: LucideIcon }
> = {
  OK: { label: "On schedule", tone: "success", icon: CheckCircle2 },
  LATE: { label: "Late", tone: "warning", icon: Clock },
  FAILING: { label: "Failing", tone: "danger", icon: AlertOctagon },
  NEVER_RUN: { label: "Not run yet", tone: "neutral", icon: CircleDashed },
};

function every(minutes: number): string {
  if (minutes < 60) return minutes === 1 ? "every minute" : `every ${minutes} min`;
  if (minutes < 1440) return minutes === 60 ? "hourly" : `every ${minutes / 60} h`;
  return "daily";
}

function duration(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function ago(iso: string | null): string {
  return iso ? relativeHours(iso) : "never";
}

/** Scheduled jobs, the queue of outgoing work, and the last signs of life from providers. */
export function SystemHealthPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const health = useQuery({
    queryKey: ["ops-health"],
    queryFn: api.systemHealth,
    refetchInterval: 30_000,
  });
  const run = useMutation({
    mutationFn: (job: JobName) => api.runJob(job),
    onSuccess: (r) => {
      toast("success", `${JOB_LABELS[r.job]}: ${r.processed} done`);
      void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("ops") });
    },
    onError: (e) => {
      toast("error", (e as Error).message);
      void qc.invalidateQueries({ queryKey: ["ops-health"] });
    },
  });
  const h = health.data;

  return (
    <Card className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <h2 id="system-health" className="font-sans text-lg font-bold">
          System health
        </h2>
        {h && (
          <Badge tone={h.status === "OK" ? "success" : "warning"}>
            {h.status === "OK" ? (
              <CheckCircle2 className="size-3.5" aria-hidden />
            ) : (
              <AlertOctagon className="size-3.5" aria-hidden />
            )}
            {h.status === "OK" ? "All jobs on schedule" : "Needs attention"}
          </Badge>
        )}
      </div>
      {!h ? (
        <Skeleton className="m-4 h-48" />
      ) : (
        <>
          <dl className="grid gap-px border-b border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Queued work due",
                value: String(h.outbox.due),
                note:
                  h.outbox.oldestDueAgeSeconds !== null && h.outbox.oldestDueAgeSeconds > 60
                    ? `oldest waiting ${Math.round(h.outbox.oldestDueAgeSeconds / 60)} min`
                    : `${h.outbox.pending} scheduled in all`,
                warn: (h.outbox.oldestDueAgeSeconds ?? 0) > 15 * 60,
              },
              {
                label: "Parked after retries",
                value: String(h.outbox.failed),
                note: h.outbox.failedByTopic.length
                  ? h.outbox.failedByTopic.map((t) => `${t.topic} ${t.count}`).join(" · ")
                  : "nothing stuck",
                warn: h.outbox.failed > 0,
              },
              {
                label: "Last payment captured",
                value: ago(h.signals.lastPaymentCapturedAt),
                note: h.signals.lastPaymentCapturedAt
                  ? formatDateTime(h.signals.lastPaymentCapturedAt)
                  : "no payments yet",
                warn: false,
              },
              {
                label: "Last courier update",
                value: ago(h.signals.lastCarrierEventAt),
                note: `database ${h.database.latencyMs} ms`,
                warn: false,
              },
            ].map((s) => (
              <div key={s.label} className="bg-card p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  {s.label}
                </dt>
                <dd className={`mt-1 text-xl font-bold ${s.warn ? "text-warning" : "text-ink"}`}>
                  {s.value}
                </dd>
                <dd className="mt-0.5 truncate text-xs text-ink-muted" title={s.note}>
                  {s.note}
                </dd>
              </div>
            ))}
          </dl>
          <ul aria-labelledby="system-health" className="divide-y divide-line">
            {h.jobs.map((j) => {
              const look = HEALTH_LOOK[j.health];
              return (
                <li
                  key={j.job}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4"
                  aria-label={JOB_LABELS[j.job]}
                >
                  <div className="min-w-48 flex-1">
                    <p className="font-semibold">{JOB_LABELS[j.job]}</p>
                    <p className="text-xs text-ink-muted">
                      Runs {every(j.cadenceMinutes)} · last {ago(j.lastRunAt)}
                      {j.lastProcessed !== null && ` · ${j.lastProcessed} done`}
                    </p>
                    {j.lastError && (
                      <p className="mt-1 break-words text-xs font-semibold text-danger">
                        {j.lastError}
                      </p>
                    )}
                  </div>
                  <div className="tabular flex items-center gap-4 text-xs text-ink-muted">
                    <span title="Average of the last 20 runs">
                      <Activity className="mr-1 inline size-3.5" aria-hidden />
                      {duration(j.avgDurationMs)}
                    </span>
                    <span className={j.failuresLast24h ? "font-semibold text-danger" : undefined}>
                      {j.failuresLast24h} failed in 24 h
                    </span>
                  </div>
                  <Badge tone={look.tone}>
                    <look.icon className="size-3.5" aria-hidden />
                    {look.label}
                  </Badge>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={run.isPending && run.variables === j.job}
                    onClick={() => run.mutate(j.job)}
                    aria-label={`Run ${JOB_LABELS[j.job]} now`}
                  >
                    <RotateCcw className="size-3.5" aria-hidden /> Run now
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
