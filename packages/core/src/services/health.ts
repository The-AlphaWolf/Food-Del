/**
 * Is the platform working? Job freshness against their schedules, the outbox backlog, and the
 * last signs of life from payments and couriers. Ops sees the detail; uptime monitors see only
 * ready / not ready.
 */
import { schema } from "@food-del/db";
import {
  JOB_CADENCE_MINUTES,
  JOB_NAMES,
  type JobName,
  type SystemHealth,
} from "@food-del/domain/contracts";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { CoreDeps } from "../deps";
import { isoOrNull } from "../mappers";
import { requireStaff, type Viewer } from "../viewer";

const { jobRuns } = schema;

/** Job history kept for the health view and incident timelines. */
const JOB_RUN_RETENTION_DAYS = 14;
/** Due outbox work older than this means the queue isn't being worked. */
const OUTBOX_STALL_SECONDS = 15 * 60;

export const lateAfterMinutes = (cadence: number) => Math.max(3 * cadence, cadence + 10);

export class HealthService {
  constructor(private readonly deps: CoreDeps) {}

  /** Wrap a job run so its timing, result and any error are recorded. */
  async record(job: JobName, run: () => Promise<number>): Promise<number> {
    const startedAt = this.deps.clock();
    const t0 = performance.now();
    try {
      const processed = await run();
      await this.save(job, startedAt, t0, processed, null);
      return processed;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.deps.logger.error("job failed", {
        job,
        error,
        stack: e instanceof Error ? e.stack : undefined,
      });
      await this.save(job, startedAt, t0, 0, error).catch(() => {});
      throw e;
    }
  }

  private async save(
    job: JobName,
    startedAt: Date,
    t0: number,
    processed: number,
    error: string | null,
  ) {
    await this.deps.db.insert(jobRuns).values({
      job,
      startedAt,
      durationMs: Math.round(performance.now() - t0),
      processed,
      ok: error === null,
      error: error?.slice(0, 1000) ?? null,
    });
  }

  async pruneJobRuns(): Promise<number> {
    const cutoff = new Date(this.deps.clock().getTime() - JOB_RUN_RETENTION_DAYS * 86_400_000);
    const gone = await this.deps.db
      .delete(jobRuns)
      .where(lt(jobRuns.startedAt, cutoff))
      .returning({ id: jobRuns.id });
    return gone.length;
  }

  async system(viewer: Viewer | null): Promise<SystemHealth> {
    requireStaff(viewer);
    return this.check();
  }

  /** Public readiness: the database answers and queued work is being processed. */
  async ready(): Promise<boolean> {
    try {
      const h = await this.check();
      const outbox = h.jobs.find((j) => j.job === "process-outbox")!;
      return (
        outbox.health !== "FAILING" &&
        outbox.health !== "LATE" &&
        (h.outbox.oldestDueAgeSeconds ?? 0) < OUTBOX_STALL_SECONDS
      );
    } catch {
      return false;
    }
  }

  private async check(): Promise<SystemHealth> {
    const now = this.deps.clock();
    const t0 = performance.now();
    await this.deps.db.execute(sql`select 1`);
    const latencyMs = Math.round((performance.now() - t0) * 10) / 10;
    const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();

    const [jobs, outbox, failedByTopic, signals] = await Promise.all([
      Promise.all(
        JOB_NAMES.map(async (job) => {
          const recent = await this.deps.db
            .select()
            .from(jobRuns)
            .where(eq(jobRuns.job, job))
            .orderBy(desc(jobRuns.startedAt), desc(jobRuns.id))
            .limit(20);
          const [lastOk] = await this.deps.db
            .select({ at: jobRuns.startedAt })
            .from(jobRuns)
            .where(and(eq(jobRuns.job, job), eq(jobRuns.ok, true)))
            .orderBy(desc(jobRuns.startedAt), desc(jobRuns.id))
            .limit(1);
          const [failures] = await this.deps.db
            .select({ n: sql<number>`count(*)::int` })
            .from(jobRuns)
            .where(
              and(
                eq(jobRuns.job, job),
                eq(jobRuns.ok, false),
                sql`${jobRuns.startedAt} >= ${dayAgo}::timestamptz`,
              ),
            );
          const last = recent[0];
          const cadence = JOB_CADENCE_MINUTES[job];
          const health = !last
            ? ("NEVER_RUN" as const)
            : !last.ok
              ? ("FAILING" as const)
              : now.getTime() - last.startedAt.getTime() > lateAfterMinutes(cadence) * 60_000
                ? ("LATE" as const)
                : ("OK" as const);
          return {
            job,
            cadenceMinutes: cadence,
            health,
            lastRunAt: isoOrNull(last?.startedAt),
            lastOkAt: isoOrNull(lastOk?.at),
            lastError: last && !last.ok ? last.error : null,
            lastProcessed: last ? last.processed : null,
            avgDurationMs: recent.length
              ? Math.round(recent.reduce((n, r) => n + r.durationMs, 0) / recent.length)
              : null,
            failuresLast24h: failures?.n ?? 0,
          };
        }),
      ),
      this.deps.db.execute<{
        pending: number;
        due: number;
        oldest: number | null;
        failed: number;
      }>(sql`
        select
          (count(*) filter (where status = 'PENDING'))::int as pending,
          (count(*) filter (where status = 'PENDING' and available_at <= ${now.toISOString()}::timestamptz))::int as due,
          extract(epoch from (${now.toISOString()}::timestamptz - min(available_at) filter (where status = 'PENDING' and available_at <= ${now.toISOString()}::timestamptz)))::int as oldest,
          (count(*) filter (where status = 'FAILED'))::int as failed
        from outbox
      `),
      this.deps.db.execute<{ topic: string; count: number }>(sql`
        select topic, count(*)::int as count from outbox where status = 'FAILED' group by topic order by count desc
      `),
      this.deps.db.execute<{ payment: string | null; carrier: string | null }>(sql`
        select
          (select to_char(max(captured_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from payments) as payment,
          (select to_char(max(occurred_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from shipment_events where actor = 'CARRIER') as carrier
      `),
    ]);
    const o = [...outbox][0]!;
    const s = [...signals][0]!;
    return {
      checkedAt: now.toISOString(),
      status: jobs.some((j) => j.health === "FAILING" || j.health === "LATE") ? "DEGRADED" : "OK",
      database: { latencyMs },
      jobs,
      outbox: {
        pending: o.pending,
        due: o.due,
        oldestDueAgeSeconds: o.oldest,
        failed: o.failed,
        failedByTopic: [...failedByTopic],
      },
      signals: { lastPaymentCapturedAt: s.payment, lastCarrierEventAt: s.carrier },
    };
  }
}
