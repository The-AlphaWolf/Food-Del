import { schema } from "@food-del/db";
import { lt, sql } from "drizzle-orm";
import type { CoreDeps } from "../deps";

const { rateLimits } = schema;

export interface RateLimitPolicy {
  /** Requests allowed per window. */
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
}

/**
 * Fixed-window counters in Postgres, so the limit holds across every serverless instance.
 * One upsert per checked request; only abuse-prone endpoints are checked.
 */
export class RateLimiter {
  constructor(private readonly deps: CoreDeps) {}

  async hit(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
    const now = this.deps.clock().getTime();
    const windowMs = policy.windowSeconds * 1000;
    const start = new Date(Math.floor(now / windowMs) * windowMs);
    const [row] = await this.deps.db
      .insert(rateLimits)
      .values({ key, windowStart: start, count: 1 })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`case when ${rateLimits.windowStart} = excluded.window_start then ${rateLimits.count} + 1 else 1 end`,
          windowStart: sql`excluded.window_start`,
        },
      })
      .returning({ count: rateLimits.count });
    const count = row?.count ?? 1;
    return {
      allowed: count <= policy.limit,
      remaining: Math.max(0, policy.limit - count),
      resetSeconds: Math.ceil((start.getTime() + windowMs - now) / 1000),
    };
  }

  /** Drop counters for windows that ended over a day ago. */
  async prune(): Promise<number> {
    const cutoff = new Date(this.deps.clock().getTime() - 86_400_000);
    const gone = await this.deps.db
      .delete(rateLimits)
      .where(lt(rateLimits.windowStart, cutoff))
      .returning({ key: rateLimits.key });
    return gone.length;
  }
}
