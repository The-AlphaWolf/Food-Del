/**
 * Shipment state machine for intercity perishable delivery.
 *
 * A shipment is one vendor's parcel within an order. The happy path is
 *
 *   PENDING_PAYMENT → PLACED → BATCHED → PACKED_COLD_CHAIN → PICKED_UP → IN_TRANSIT_INTERCITY
 *     → AT_DESTINATION_HUB → OUT_FOR_LOCAL_DELIVERY → DELIVERED
 *
 * Carriers skip scans, so carrier-driven moves may jump forward along the transit track but
 * never backwards. There is no return-to-origin for perishables: an undeliverable parcel ends
 * in FAILED and is disposed of.
 */

export const SHIPMENT_STATUSES = [
  "PENDING_PAYMENT",
  "PLACED",
  "BATCHED",
  "PACKED_COLD_CHAIN",
  "PICKED_UP",
  "IN_TRANSIT_INTERCITY",
  "AT_DESTINATION_HUB",
  "OUT_FOR_LOCAL_DELIVERY",
  "DELIVERY_ATTEMPT_FAILED",
  "DELIVERED",
  "CANCELLED",
  "FAILED",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const ACTORS = ["SYSTEM", "CUSTOMER", "VENDOR", "OPS", "CARRIER"] as const;
export type Actor = (typeof ACTORS)[number];

export const FAILURE_REASONS = [
  "VENDOR_UNFULFILLED",
  "UNDELIVERABLE",
  "SPOILED",
  "LOST",
  "DAMAGED",
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

export const TERMINAL_STATUSES: ReadonlySet<ShipmentStatus> = new Set([
  "DELIVERED",
  "CANCELLED",
  "FAILED",
]);

/** Statuses during which the parcel is physically with the courier. */
export const IN_FLIGHT_STATUSES: ReadonlySet<ShipmentStatus> = new Set([
  "PICKED_UP",
  "IN_TRANSIT_INTERCITY",
  "AT_DESTINATION_HUB",
  "OUT_FOR_LOCAL_DELIVERY",
  "DELIVERY_ATTEMPT_FAILED",
]);

type TransitionTable = Partial<
  Record<ShipmentStatus, Partial<Record<ShipmentStatus, readonly Actor[]>>>
>;

/** Forward-only track carriers report along (scans may be skipped). */
const TRANSIT_TRACK: readonly ShipmentStatus[] = [
  "PACKED_COLD_CHAIN",
  "PICKED_UP",
  "IN_TRANSIT_INTERCITY",
  "AT_DESTINATION_HUB",
  "OUT_FOR_LOCAL_DELIVERY",
  "DELIVERED",
];

function buildTable(): TransitionTable {
  const t: TransitionTable = {
    PENDING_PAYMENT: {
      PLACED: ["SYSTEM"],
      CANCELLED: ["SYSTEM", "CUSTOMER", "OPS"],
    },
    PLACED: {
      BATCHED: ["SYSTEM", "OPS"],
      CANCELLED: ["CUSTOMER", "OPS", "SYSTEM"],
    },
    BATCHED: {
      PACKED_COLD_CHAIN: ["VENDOR", "OPS"],
      FAILED: ["VENDOR", "OPS"],
      CANCELLED: ["OPS"],
    },
    DELIVERY_ATTEMPT_FAILED: {
      OUT_FOR_LOCAL_DELIVERY: ["CARRIER", "OPS"],
      DELIVERED: ["CARRIER", "OPS"],
      FAILED: ["OPS", "SYSTEM"],
    },
  };
  // Carrier progress: any forward jump along the transit track.
  for (let i = 0; i < TRANSIT_TRACK.length; i++) {
    const from = TRANSIT_TRACK[i]!;
    if (from === "DELIVERED") continue;
    const row = t[from] ?? {};
    t[from] = row;
    for (let j = i + 1; j < TRANSIT_TRACK.length; j++) {
      row[TRANSIT_TRACK[j]!] = ["CARRIER", "OPS"];
    }
    // Every pre-delivery state with the parcel packed or in flight can end in failure.
    row.FAILED = ["OPS", "SYSTEM"];
  }
  // Failed delivery attempts happen at the destination hub or on the van.
  t.AT_DESTINATION_HUB!.DELIVERY_ATTEMPT_FAILED = ["CARRIER", "OPS"];
  t.OUT_FOR_LOCAL_DELIVERY!.DELIVERY_ATTEMPT_FAILED = ["CARRIER", "OPS"];
  return t;
}

const TABLE = buildTable();

export function allowedActors(from: ShipmentStatus, to: ShipmentStatus): readonly Actor[] {
  return TABLE[from]?.[to] ?? [];
}

export function canTransition(from: ShipmentStatus, to: ShipmentStatus, actor: Actor): boolean {
  return allowedActors(from, to).includes(actor);
}

/** Where `actor` may move a shipment from `from`. */
export function nextStatuses(from: ShipmentStatus, actor: Actor): ShipmentStatus[] {
  const row = TABLE[from] ?? {};
  return (Object.keys(row) as ShipmentStatus[]).filter((to) => row[to]?.includes(actor));
}

export function isTerminal(status: ShipmentStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: ShipmentStatus,
    readonly to: ShipmentStatus,
    readonly actor: Actor,
  ) {
    super(`${actor} cannot move a shipment from ${from} to ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export interface TransitionRequest {
  from: ShipmentStatus;
  to: ShipmentStatus;
  actor: Actor;
  failureReason?: FailureReason | null;
}

/** Throws unless the transition is legal; FAILED always needs a reason and nothing else may carry one. */
export function assertTransition(req: TransitionRequest): void {
  if (!canTransition(req.from, req.to, req.actor)) {
    throw new IllegalTransitionError(req.from, req.to, req.actor);
  }
  if ((req.to === "FAILED") !== (req.failureReason != null)) {
    throw new Error(
      req.to === "FAILED"
        ? "A failed shipment needs a failure reason"
        : "Only FAILED takes a reason",
    );
  }
}

// ---------------------------------------------------------------------------
// Carrier events
// ---------------------------------------------------------------------------

export type CarrierEventDecision = "APPLY" | "IGNORE_STALE" | "IGNORE_INVALID";

/**
 * Webhooks arrive late, twice, or out of order. Apply a carrier status only when it is a legal
 * forward move; anything at or behind the current position is stale and dropped silently.
 */
export function decideCarrierEvent(
  current: ShipmentStatus,
  incoming: ShipmentStatus,
): CarrierEventDecision {
  if (current === incoming) return "IGNORE_STALE";
  if (canTransition(current, incoming, "CARRIER")) return "APPLY";
  if (isTerminal(current)) return "IGNORE_STALE";
  const c = CARRIER_RANK[current];
  const i = CARRIER_RANK[incoming];
  if (c !== undefined && i !== undefined && i <= c) return "IGNORE_STALE";
  // e.g. a pickup scan for a parcel the vendor never marked packed: surface it to ops.
  return "IGNORE_INVALID";
}

const CARRIER_RANK: Partial<Record<ShipmentStatus, number>> = {
  PACKED_COLD_CHAIN: 0,
  PICKED_UP: 1,
  IN_TRANSIT_INTERCITY: 2,
  AT_DESTINATION_HUB: 3,
  OUT_FOR_LOCAL_DELIVERY: 4,
  DELIVERY_ATTEMPT_FAILED: 4,
  DELIVERED: 5,
};

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/** Customers may cancel for a full refund until the vendor's order cutoff. */
export function canCustomerCancel(status: ShipmentStatus, cutoffAt: Date, now: Date): boolean {
  return (
    (status === "PLACED" || status === "PENDING_PAYMENT") && now.getTime() < cutoffAt.getTime()
  );
}

export interface RefundDecision {
  refundItems: boolean;
  refundFees: boolean;
}

/**
 * Who pays when a perishable parcel fails. A customer who could not be reached (UNDELIVERABLE)
 * gets nothing back — the food cannot be resold. Everything else is on us, the vendor or the
 * carrier, and the customer is made whole.
 */
export function refundPolicyFor(reason: FailureReason): RefundDecision {
  if (reason === "UNDELIVERABLE") return { refundItems: false, refundFees: false };
  return { refundItems: true, refundFees: true };
}

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PLACED: "Order placed",
  BATCHED: "In the kitchen's batch",
  PACKED_COLD_CHAIN: "Packed for the journey",
  PICKED_UP: "Picked up by courier",
  IN_TRANSIT_INTERCITY: "On its way to your city",
  AT_DESTINATION_HUB: "Arrived in your city",
  OUT_FOR_LOCAL_DELIVERY: "Out for delivery",
  DELIVERY_ATTEMPT_FAILED: "Delivery attempt missed",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  FAILED: "Could not be delivered",
};

/** Customer-facing timeline steps, in order. */
export const CUSTOMER_TIMELINE: readonly ShipmentStatus[] = [
  "PLACED",
  "BATCHED",
  "PACKED_COLD_CHAIN",
  "IN_TRANSIT_INTERCITY",
  "AT_DESTINATION_HUB",
  "OUT_FOR_LOCAL_DELIVERY",
  "DELIVERED",
];

const TIMELINE_POSITION: Partial<Record<ShipmentStatus, number>> = {
  PENDING_PAYMENT: -1,
  PLACED: 0,
  BATCHED: 1,
  PACKED_COLD_CHAIN: 2,
  PICKED_UP: 3,
  IN_TRANSIT_INTERCITY: 3,
  AT_DESTINATION_HUB: 4,
  OUT_FOR_LOCAL_DELIVERY: 5,
  DELIVERY_ATTEMPT_FAILED: 5,
  DELIVERED: 6,
};

/** Index into `CUSTOMER_TIMELINE` reached so far (-1 before payment, null for cancelled/failed). */
export function timelinePosition(status: ShipmentStatus): number | null {
  return TIMELINE_POSITION[status] ?? null;
}
