/**
 * Kitchen payouts for the ops console: what each kitchen is owed, what's stuck and why, what was
 * paid or clawed back, and a statement finance can reconcile against the payment provider.
 */
import { schema } from "@food-del/db";
import {
  addDays,
  atIst,
  istDateOf,
  type LocalDate,
  PAYOUT_ACTION_STATES,
  type PayoutFacts,
  type PayoutState,
  payoutState,
} from "@food-del/domain";
import type {
  HoldPayoutRequest,
  PayoutListQuery,
  PayoutRow,
  PayoutSummary,
} from "@food-del/domain/contracts";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { CoreDeps } from "../deps";
import { conflict, notFound } from "../errors";
import { iso, isoOrNull } from "../mappers";
import { requireStaff, type Viewer } from "../viewer";
import type { OutboxProcessor } from "./outbox";
import { queueTransfer } from "./tracking";

const { cities, orders, outbox, shipments, vendorPayouts, vendors } = schema;

const LIST_LIMIT = 300;

/** Which stored status a derived state lives under, so lists can filter in SQL first. */
function statusesFor(state: PayoutListQuery["state"]): ("ON_HOLD" | "RELEASED" | "REVERSED")[] {
  if (!state) return ["ON_HOLD", "RELEASED", "REVERSED"];
  if (state === "RELEASED") return ["RELEASED"];
  if (state === "CLAWED_BACK") return ["REVERSED"];
  if (state === "REVERSAL_PENDING") return ["REVERSED"];
  if (state === "NEEDS_ACTION") return ["ON_HOLD", "REVERSED"];
  return ["ON_HOLD"];
}

const rupees = (paise: number) => (paise / 100).toFixed(2);

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export class PayoutService {
  constructor(
    private readonly deps: CoreDeps,
    private readonly outbox: OutboxProcessor,
  ) {}

  private get db() {
    return this.deps.db;
  }

  /** Payout rows with everything needed to say where each one stands. */
  private async load(where: SQL | undefined, order: "newest" | "oldest", limit: number) {
    const rows = await this.db
      .select({
        p: vendorPayouts,
        kitchenName: vendors.name,
        accountRef: vendors.payoutAccountRef,
        city: cities.name,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        deliveredAt: shipments.deliveredAt,
        openClaimId: sql<
          string | null
        >`(select c.id from claims c where c.shipment_id = "vendor_payouts"."shipment_id" and c.status = 'OPEN' limit 1)`,
        transferError: sql<
          string | null
        >`(select o.last_error from outbox o where o.topic in ('payout.transfer', 'payout.reverse') and o.status = 'FAILED' and o.payload->>'payoutId' = "vendor_payouts"."id"::text order by o.id desc limit 1)`,
      })
      .from(vendorPayouts)
      .innerJoin(vendors, eq(vendors.id, vendorPayouts.vendorId))
      .innerJoin(cities, eq(cities.id, vendors.cityId))
      .innerJoin(shipments, eq(shipments.id, vendorPayouts.shipmentId))
      .innerJoin(orders, eq(orders.id, shipments.orderId))
      .where(where)
      .orderBy(order === "newest" ? desc(vendorPayouts.createdAt) : asc(vendorPayouts.createdAt))
      .limit(limit);
    const now = this.deps.clock();
    return rows.map((r): PayoutRow => {
      const facts: PayoutFacts = {
        status: r.p.status,
        releaseAfter: r.p.releaseAfter,
        now,
        heldReason: r.p.heldReason,
        openClaim: r.openClaimId !== null,
        accountLinked: Boolean(r.accountRef),
        transferred: r.p.providerTransferId !== null,
        transferFailed: r.transferError !== null,
        reversalRecorded: r.p.providerReversalId !== null,
      };
      const state = payoutState(facts);
      return {
        id: r.p.id,
        orderId: r.orderId,
        orderNumber: r.orderNumber,
        shipmentId: r.p.shipmentId,
        kitchen: { id: r.p.vendorId, name: r.kitchenName, city: r.city },
        grossPaise: r.p.grossPaise,
        commissionPaise: r.p.commissionPaise,
        netPaise: r.p.netPaise,
        status: r.p.status,
        state,
        needsAction: PAYOUT_ACTION_STATES.includes(state),
        deliveredAt: isoOrNull(r.deliveredAt),
        releaseAfter: iso(r.p.releaseAfter),
        releasedAt: isoOrNull(r.p.releasedAt),
        reversedAt: isoOrNull(r.p.reversedAt),
        heldReason: r.p.heldReason,
        heldAt: isoOrNull(r.p.heldAt),
        openClaimId: r.openClaimId,
        transferId: r.p.providerTransferId,
        transferError: r.transferError,
        reversalId: r.p.providerReversalId,
        createdAt: iso(r.p.createdAt),
      };
    });
  }

  private periodWhere(from?: LocalDate, to?: LocalDate): SQL[] {
    return [
      ...(from ? [gte(vendorPayouts.createdAt, atIst(from, "00:00"))] : []),
      ...(to ? [lt(vendorPayouts.createdAt, atIst(addDays(to, 1), "00:00"))] : []),
    ];
  }

  async list(viewer: Viewer | null, query: PayoutListQuery = {}): Promise<PayoutRow[]> {
    requireStaff(viewer);
    const where = and(
      inArray(vendorPayouts.status, statusesFor(query.state)),
      query.vendorId ? eq(vendorPayouts.vendorId, query.vendorId) : undefined,
      query.q
        ? or(ilike(orders.orderNumber, `%${query.q}%`), ilike(vendors.name, `%${query.q}%`))
        : undefined,
      ...this.periodWhere(query.from, query.to),
    );
    const rows = await this.load(where, "newest", query.state ? LIST_LIMIT * 4 : LIST_LIMIT);
    const wanted = query.state;
    if (!wanted) return rows;
    return rows
      .filter((r) => (wanted === "NEEDS_ACTION" ? r.needsAction : r.state === wanted))
      .slice(0, LIST_LIMIT);
  }

  async get(viewer: Viewer | null, id: string): Promise<PayoutRow> {
    requireStaff(viewer);
    const [row] = await this.load(eq(vendorPayouts.id, id), "newest", 1);
    if (!row) throw notFound("Payout");
    return row;
  }

  /** Totals for the last `days` days (IST), and what every kitchen is owed right now. */
  async summary(viewer: Viewer | null, days = 30): Promise<PayoutSummary> {
    requireStaff(viewer);
    const to = istDateOf(this.deps.clock());
    const from = addDays(to, -(days - 1));
    const start = atIst(from, "00:00").toISOString();
    const end = atIst(addDays(to, 1), "00:00").toISOString();
    const inPeriod = (col: string) =>
      sql.raw(`${col} >= '${start}'::timestamptz and ${col} < '${end}'::timestamptz`);

    // Everything still owed (or owed back) is bounded by the claim window, so derive it per row.
    const open = await this.load(
      or(
        eq(vendorPayouts.status, "ON_HOLD"),
        and(
          eq(vendorPayouts.status, "REVERSED"),
          isNotNull(vendorPayouts.providerTransferId),
          sql`"vendor_payouts"."provider_reversal_id" is null`,
        ),
      ),
      "newest",
      10_000,
    );
    const periodRows = await this.db
      .select({
        vendorId: vendorPayouts.vendorId,
        paid: sql<number>`coalesce(sum(${vendorPayouts.netPaise}) filter (where ${vendorPayouts.status} = 'RELEASED' and ${inPeriod('"vendor_payouts"."released_at"')}), 0)::int`,
        paidCount: sql<number>`(count(*) filter (where ${vendorPayouts.status} = 'RELEASED' and ${inPeriod('"vendor_payouts"."released_at"')}))::int`,
        clawed: sql<number>`coalesce(sum(${vendorPayouts.netPaise}) filter (where ${vendorPayouts.status} = 'REVERSED' and ${inPeriod('"vendor_payouts"."reversed_at"')}), 0)::int`,
        clawedCount: sql<number>`(count(*) filter (where ${vendorPayouts.status} = 'REVERSED' and ${inPeriod('"vendor_payouts"."reversed_at"')}))::int`,
        commission: sql<number>`coalesce(sum(${vendorPayouts.commissionPaise}) filter (where ${vendorPayouts.status} <> 'REVERSED' and ${inPeriod('"vendor_payouts"."created_at"')}), 0)::int`,
      })
      .from(vendorPayouts)
      .groupBy(vendorPayouts.vendorId);
    const kitchenRows = await this.db
      .select({
        id: vendors.id,
        name: vendors.name,
        city: cities.name,
        accountRef: vendors.payoutAccountRef,
      })
      .from(vendors)
      .innerJoin(cities, eq(cities.id, vendors.cityId))
      .orderBy(asc(cities.sortOrder), asc(vendors.name));

    const period = new Map(periodRows.map((r) => [r.vendorId, r]));
    const owedRows = open.filter((r) => r.status === "ON_HOLD");
    const actionRows = open.filter((r) => r.needsAction);
    const sum = (rows: PayoutRow[]) => rows.reduce((n, r) => n + r.netPaise, 0);
    const kitchens = kitchenRows
      .map((k) => {
        const p = period.get(k.id);
        return {
          id: k.id,
          name: k.name,
          city: k.city,
          accountLinked: Boolean(k.accountRef),
          owedPaise: sum(owedRows.filter((r) => r.kitchen.id === k.id)),
          needsAction: actionRows.filter((r) => r.kitchen.id === k.id).length,
          paidPaise: p?.paid ?? 0,
          clawedBackPaise: p?.clawed ?? 0,
          commissionPaise: p?.commission ?? 0,
        };
      })
      .filter(
        (k) => k.owedPaise > 0 || k.needsAction > 0 || k.paidPaise > 0 || k.clawedBackPaise > 0,
      )
      .sort((a, b) => b.needsAction - a.needsAction || b.owedPaise - a.owedPaise);
    return {
      period: { from, to },
      owed: { count: owedRows.length, netPaise: sum(owedRows) },
      needsAction: { count: actionRows.length, netPaise: sum(actionRows) },
      paid: {
        count: periodRows.reduce((n, r) => n + r.paidCount, 0),
        netPaise: periodRows.reduce((n, r) => n + r.paid, 0),
      },
      clawedBack: {
        count: periodRows.reduce((n, r) => n + r.clawedCount, 0),
        netPaise: periodRows.reduce((n, r) => n + r.clawed, 0),
      },
      commissionPaise: periodRows.reduce((n, r) => n + r.commission, 0),
      kitchens,
    };
  }

  /** Stop a payout from being paid while something is looked into. */
  async hold(viewer: Viewer | null, id: string, { reason }: HoldPayoutRequest): Promise<PayoutRow> {
    requireStaff(viewer);
    const held = await this.db
      .update(vendorPayouts)
      .set({ heldReason: reason, heldAt: this.deps.clock() })
      .where(and(eq(vendorPayouts.id, id), eq(vendorPayouts.status, "ON_HOLD")))
      .returning({ id: vendorPayouts.id });
    if (held.length === 0) {
      await this.get(viewer, id);
      throw conflict("PAYOUT_SETTLED", "This payout has already been paid or clawed back.");
    }
    this.deps.logger.info("payout held", { payoutId: id, by: viewer!.userId });
    return this.get(viewer, id);
  }

  /** Lift a review hold; the payout continues on its normal schedule. */
  async resume(viewer: Viewer | null, id: string): Promise<PayoutRow> {
    requireStaff(viewer);
    await this.db
      .update(vendorPayouts)
      .set({ heldReason: null, heldAt: null })
      .where(and(eq(vendorPayouts.id, id), eq(vendorPayouts.status, "ON_HOLD")));
    return this.get(viewer, id);
  }

  /**
   * Try a payout's provider transfer (or a clawback's reversal) again now, after fixing what
   * made it fail, such as a wrong payout account.
   */
  async retry(viewer: Viewer | null, id: string): Promise<PayoutRow> {
    const row = await this.get(viewer, id);
    const topic =
      row.state === "REVERSAL_PENDING"
        ? ("payout.reverse" as const)
        : row.status === "ON_HOLD" && !row.transferId
          ? ("payout.transfer" as const)
          : null;
    if (!topic) {
      throw conflict("NOTHING_TO_RETRY", "There's no transfer or clawback waiting on this payout.");
    }
    if (topic === "payout.transfer" && row.state === "NEEDS_PAYOUT_ACCOUNT") {
      throw conflict(
        "NO_PAYOUT_ACCOUNT",
        `${row.kitchen.name} has no payout account yet. Link one on the kitchen's page first.`,
      );
    }
    const now = this.deps.clock();
    const reset = await this.db
      .update(outbox)
      .set({ status: "PENDING", attempts: 0, availableAt: now })
      .where(
        and(
          eq(outbox.topic, topic),
          inArray(outbox.status, ["FAILED", "PENDING"]),
          sql`${outbox.payload}->>'payoutId' = ${id}`,
        ),
      )
      .returning({ id: outbox.id });
    if (reset.length === 0) {
      if (topic === "payout.transfer") await queueTransfer(this.db, id);
      else await this.db.insert(outbox).values({ topic, payload: { payoutId: id } });
    }
    await this.outbox.processFor(topic, { payoutId: id });
    return this.get(viewer, id);
  }

  /** A statement finance can reconcile: one line per payout created in the period. */
  async statementCsv(
    viewer: Viewer | null,
    query: { from: LocalDate; to: LocalDate; vendorId?: string },
  ): Promise<string> {
    requireStaff(viewer);
    const rows = await this.load(
      and(
        query.vendorId ? eq(vendorPayouts.vendorId, query.vendorId) : undefined,
        ...this.periodWhere(query.from, query.to),
      ),
      "oldest",
      50_000,
    );
    const header = [
      "payout_id",
      "order_number",
      "kitchen",
      "city",
      "delivered_at",
      "gross_inr",
      "commission_inr",
      "net_inr",
      "status",
      "state",
      "release_after",
      "released_at",
      "reversed_at",
      "provider_transfer_id",
      "provider_reversal_id",
      "held_reason",
    ];
    const lines = rows.map((r) =>
      [
        r.id,
        r.orderNumber,
        r.kitchen.name,
        r.kitchen.city,
        r.deliveredAt,
        rupees(r.grossPaise),
        rupees(r.commissionPaise),
        rupees(r.netPaise),
        r.status,
        r.state,
        r.releaseAfter,
        r.releasedAt,
        r.reversedAt,
        r.transferId,
        r.reversalId,
        r.heldReason,
      ]
        .map(csvCell)
        .join(","),
    );
    return `${[header.join(","), ...lines].join("\r\n")}\r\n`;
  }
}

export type { PayoutState };
