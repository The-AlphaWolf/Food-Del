import { materializeInventorySlots } from "@food-del/db";
import type { JobName, JobResult } from "@food-del/domain/contracts";
import type { CoreDeps } from "./deps";
import { AccountService } from "./services/accounts";
import { CatalogService } from "./services/catalog";
import { ClaimService } from "./services/claims";
import { FulfilmentService } from "./services/fulfilment";
import { NotificationService } from "./services/notifications";
import { OpsService } from "./services/ops";
import { OrderService } from "./services/orders";
import { OutboxProcessor } from "./services/outbox";
import { QuoteService } from "./services/quotes";
import { ServiceabilityService } from "./services/serviceability";
import { TrackingService } from "./services/tracking";

/** Wire every use-case to its dependencies. One instance per process. */
export function createCore(deps: CoreDeps) {
  const fulfilment = new FulfilmentService(deps);
  const tracking = new TrackingService(deps);
  const notifications = new NotificationService(deps);
  const orders = new OrderService(deps);
  const outbox = new OutboxProcessor(deps, { fulfilment, tracking, notifications });

  const jobs: Record<JobName, () => Promise<number>> = {
    "lock-batches": () => fulfilment.lockDueBatches(),
    "expire-holds": () => orders.expireUnpaid(),
    "monitor-at-risk": () => tracking.monitorAtRisk(),
    "release-payouts": () => tracking.releasePayouts(),
    "materialize-slots": () => materializeInventorySlots(deps.db, { days: 30, now: deps.clock() }),
    "process-outbox": () => outbox.process(100),
  };

  return {
    deps,
    accounts: new AccountService(deps),
    catalog: new CatalogService(deps),
    serviceability: new ServiceabilityService(deps),
    quotes: new QuoteService(deps),
    orders,
    fulfilment,
    tracking,
    claims: new ClaimService(deps),
    ops: new OpsService(deps),
    notifications,
    outbox,
    async runJob(job: JobName): Promise<JobResult> {
      const processed = await jobs[job]();
      return { job, processed };
    },
  };
}

export type Core = ReturnType<typeof createCore>;
