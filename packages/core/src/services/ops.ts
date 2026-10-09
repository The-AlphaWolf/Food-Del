import { schema } from "@food-del/db";
import {
  addDays,
  hoursBetween,
  istDateOf,
  refundPolicyFor,
  SHIPMENT_STATUS_LABELS,
  type ShipmentStatus,
} from "@food-del/domain";
import type {
  Blackout,
  BlackoutInput,
  OpsCity,
  OpsOverview,
  OpsShipmentRow,
  OpsTransitionRequest,
  OpsVendor,
  UpdateCityRequest,
  UpdateVendorRequest,
} from "@food-del/domain/contracts";
import { aliasedTable, and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import type { CoreDeps } from "../deps";
import { invalid, notFound } from "../errors";
import { iso, isoOrNull } from "../mappers";
import { invalidateReference } from "../planning";
import { requireStaff, type Viewer } from "../viewer";
import { createRefund, shipmentChargePaise } from "./orders";
import { enqueue, transitionShipment } from "./shipments";

const { calendarBlackouts, cities, claims, orders, outbox, payments, shipments, vendors } = schema;

const OPEN: ShipmentStatus[] = [
  "PLACED",
  "BATCHED",
  "PACKED_COLD_CHAIN",
  "PICKED_UP",
  "IN_TRANSIT_INTERCITY",
  "AT_DESTINATION_HUB",
  "OUT_FOR_LOCAL_DELIVERY",
  "DELIVERY_ATTEMPT_FAILED",
];

export interface ShipmentFilter {
  id?: string;
  status?: ShipmentStatus;
  dispatchDate?: string;
  q?: string;
  onlyExceptions?: boolean;
}

export class OpsService {
  constructor(private readonly deps: CoreDeps) {}

  private get db() {
    return this.deps.db;
  }

  async shipments(
    viewer: Viewer | null,
    filter: ShipmentFilter = {},
    limit = 200,
  ): Promise<OpsShipmentRow[]> {
    requireStaff(viewer);
    const now = this.deps.clock();
    const originCity = aliasedTable(cities, "origin_city");
    const conditions = [];
    if (filter.id) conditions.push(eq(shipments.id, filter.id));
    if (filter.status) conditions.push(eq(shipments.status, filter.status));
    if (filter.dispatchDate) conditions.push(eq(shipments.dispatchDate, filter.dispatchDate));
    if (filter.q?.trim()) {
      const q = `%${filter.q.trim()}%`;
      conditions.push(
        or(
          sql`${orders.orderNumber} ilike ${q}`,
          sql`${shipments.awbNumber} ilike ${q}`,
          sql`${vendors.name} ilike ${q}`,
        ),
      );
    }
    if (filter.onlyExceptions) {
      conditions.push(
        or(
          eq(shipments.isAtRisk, true),
          eq(shipments.status, "DELIVERY_ATTEMPT_FAILED"),
          and(
            inArray(shipments.status, OPEN),
            sql`${shipments.deliverByAt} < ${now.toISOString()}::timestamptz`,
          ),
          and(
            eq(shipments.status, "PLACED"),
            sql`${shipments.orderCutoffAt} < ${now.toISOString()}::timestamptz - interval '1 hour'`,
          ),
          and(
            eq(shipments.status, "PACKED_COLD_CHAIN"),
            sql`${shipments.awbNumber} is null`,
            sql`${shipments.packedAt} < ${now.toISOString()}::timestamptz - interval '1 hour'`,
          ),
        ),
      );
    }
    const rows = await this.db
      .select({ s: shipments, o: orders, v: vendors, origin: originCity })
      .from(shipments)
      .innerJoin(orders, eq(orders.id, shipments.orderId))
      .innerJoin(vendors, eq(vendors.id, shipments.vendorId))
      .innerJoin(originCity, eq(originCity.id, vendors.cityId))
      .where(and(...conditions))
      .orderBy(asc(shipments.deliverByAt))
      .limit(limit);
    return rows.map(({ s, o, v, origin }) => ({
      id: s.id,
      orderId: o.id,
      orderNumber: o.orderNumber,
      status: s.status,
      statusLabel: SHIPMENT_STATUS_LABELS[s.status],
      vendorName: v.name,
      originCity: origin.name,
      destCity: o.shipTo.cityName,
      destPincode: o.shipTo.pincode,
      mode: s.mode,
      carrierCode: s.carrierCode,
      awbNumber: s.awbNumber,
      dispatchDate: s.dispatchDate,
      promisedDeliveryDate: s.promisedDeliveryDate,
      deliverByAt: iso(s.deliverByAt),
      latestEtaAt: isoOrNull(s.latestEtaAt),
      isAtRisk: s.isAtRisk,
      failureReason: s.failureReason,
      hoursToSpoilage: Math.round(hoursBetween(now, s.deliverByAt) * 10) / 10,
      itemsTotalPaise: s.itemsTotalPaise,
    }));
  }

  async overview(viewer: Viewer | null): Promise<OpsOverview> {
    requireStaff(viewer);
    const now = this.deps.clock();
    const weekAgoDate = new Date(now.getTime() - 7 * 86_400_000);
    const weekAgo = sql`${weekAgoDate.toISOString()}::timestamptz`;
    const monthAgo = sql`${new Date(now.getTime() - 30 * 86_400_000).toISOString()}::timestamptz`;
    const [counts] = await this.db
      .select({
        awaitingPayment: sql<number>`count(*) filter (where ${shipments.status} = 'PENDING_PAYMENT')::int`,
        placed: sql<number>`count(*) filter (where ${shipments.status} = 'PLACED')::int`,
        inKitchen: sql<number>`count(*) filter (where ${shipments.status} in ('BATCHED', 'PACKED_COLD_CHAIN'))::int`,
        inFlight: sql<number>`count(*) filter (where ${shipments.status} in ('PICKED_UP', 'IN_TRANSIT_INTERCITY', 'AT_DESTINATION_HUB', 'OUT_FOR_LOCAL_DELIVERY', 'DELIVERY_ATTEMPT_FAILED'))::int`,
        atRisk: sql<number>`count(*) filter (where ${shipments.isAtRisk} and ${shipments.status} not in ('DELIVERED', 'CANCELLED', 'FAILED'))::int`,
        attemptsFailed: sql<number>`count(*) filter (where ${shipments.status} = 'DELIVERY_ATTEMPT_FAILED')::int`,
        delivered7d: sql<number>`count(*) filter (where ${shipments.status} = 'DELIVERED' and ${shipments.deliveredAt} >= ${weekAgo})::int`,
        failed7d: sql<number>`count(*) filter (where ${shipments.status} = 'FAILED' and ${shipments.updatedAt} >= ${weekAgo})::int`,
        deliveredOnTime30d: sql<number>`count(*) filter (where ${shipments.status} = 'DELIVERED' and ${shipments.deliveredAt} >= ${monthAgo} and (${shipments.deliveredAt} at time zone 'Asia/Kolkata')::date <= ${shipments.promisedDeliveryDate})::int`,
        delivered30d: sql<number>`count(*) filter (where ${shipments.status} = 'DELIVERED' and ${shipments.deliveredAt} >= ${monthAgo})::int`,
      })
      .from(shipments);
    const [claimCount] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(claims)
      .where(eq(claims.status, "OPEN"));
    const [outboxCounts] = await this.db
      .select({
        pending: sql<number>`count(*) filter (where ${outbox.status} = 'PENDING')::int`,
        failed: sql<number>`count(*) filter (where ${outbox.status} = 'FAILED')::int`,
      })
      .from(outbox);
    const [gmv] = await this.db
      .select({ total: sql<number>`coalesce(sum(${orders.grandTotalPaise}), 0)::int` })
      .from(orders)
      .where(gte(orders.placedAt, weekAgoDate));
    const c = counts!;
    return {
      asOf: iso(now),
      counts: {
        awaitingPayment: c.awaitingPayment,
        placed: c.placed,
        inKitchen: c.inKitchen,
        inFlight: c.inFlight,
        atRisk: c.atRisk,
        deliveryAttemptsFailed: c.attemptsFailed,
        deliveredLast7d: c.delivered7d,
        failedLast7d: c.failed7d,
        openClaims: claimCount?.n ?? 0,
        outboxPending: outboxCounts?.pending ?? 0,
        outboxFailed: outboxCounts?.failed ?? 0,
      },
      gmvLast7dPaise: gmv?.total ?? 0,
      onTimeRateLast30d: c.delivered30d > 0 ? c.deliveredOnTime30d / c.delivered30d : null,
      exceptions: await this.shipments(viewer, { onlyExceptions: true }, 50),
    };
  }

  /** Manual override, with the refund policy applied when a paid parcel is cancelled or fails. */
  async transition(
    viewerIn: Viewer | null,
    shipmentId: string,
    req: OpsTransitionRequest,
  ): Promise<OpsShipmentRow> {
    const viewer = requireStaff(viewerIn);
    const now = this.deps.clock();
    await this.db.transaction(async (tx) => {
      const { before, after } = await transitionShipment(tx, {
        shipmentId,
        to: req.to,
        actor: "OPS",
        actorId: viewer.userId,
        failureReason: req.failureReason ?? null,
        note: req.note ?? null,
        patch: req.to === "DELIVERED" ? { deliveredAt: now, isAtRisk: false } : {},
        now,
      });
      const [payment] = await tx
        .select({ status: payments.status })
        .from(payments)
        .where(eq(payments.orderId, before.orderId));
      const paid = payment && payment.status !== "CREATED" && payment.status !== "FAILED";
      const refundDue =
        paid &&
        ((req.to === "CANCELLED" && before.status !== "PENDING_PAYMENT") ||
          (req.to === "FAILED" &&
            req.failureReason &&
            refundPolicyFor(req.failureReason).refundItems));
      if (refundDue) {
        await createRefund(tx, {
          orderId: before.orderId,
          shipmentId,
          amountPaise: shipmentChargePaise(after),
          reason: req.note ?? `${req.to.toLowerCase()} by operations`,
        });
      }
      if (req.to === "FAILED" || req.to === "CANCELLED") {
        await enqueue(tx, {
          topic: "notify",
          payload: { template: "SHIPMENT_FAILED", orderId: before.orderId, shipmentId },
        });
      }
    });
    return this.shipment(viewer, shipmentId);
  }

  async shipment(viewer: Viewer | null, id: string): Promise<OpsShipmentRow> {
    const [row] = await this.shipments(viewer, { id }, 1);
    if (!row) throw notFound("Parcel");
    return row;
  }

  // ─── Calendar ───────────────────────────────────────────────────────────────────────────────

  async blackouts(viewer: Viewer | null): Promise<Blackout[]> {
    requireStaff(viewer);
    const today = istDateOf(this.deps.clock());
    const rows = await this.db
      .select()
      .from(calendarBlackouts)
      .where(gte(calendarBlackouts.date, addDays(today, -7)))
      .orderBy(asc(calendarBlackouts.date), asc(calendarBlackouts.scope));
    const cityNames = new Map(
      (await this.db.select({ id: cities.id, name: cities.name }).from(cities)).map((c) => [
        c.id,
        c.name,
      ]),
    );
    const vendorNames = new Map(
      (await this.db.select({ id: vendors.id, name: vendors.name }).from(vendors)).map((v) => [
        v.id,
        v.name,
      ]),
    );
    return rows.map((b) => ({
      id: b.id,
      scope: b.scope,
      scopeRef: b.scopeRef,
      scopeLabel:
        b.scope === "NATIONAL"
          ? "All of India"
          : b.scope === "CITY"
            ? (cityNames.get(b.scopeRef) ?? b.scopeRef)
            : b.scope === "VENDOR"
              ? (vendorNames.get(b.scopeRef) ?? b.scopeRef)
              : b.scopeRef,
      date: b.date,
      reason: b.reason,
    }));
  }

  async addBlackout(viewer: Viewer | null, input: BlackoutInput): Promise<Blackout[]> {
    requireStaff(viewer);
    if ((input.scope === "NATIONAL") !== (input.scopeRef === "")) {
      throw invalid("INVALID_SCOPE", "National blackouts take no reference; others need one.");
    }
    await this.db.insert(calendarBlackouts).values(input).onConflictDoNothing();
    return this.blackouts(viewer);
  }

  async removeBlackout(viewer: Viewer | null, id: string): Promise<Blackout[]> {
    requireStaff(viewer);
    await this.db.delete(calendarBlackouts).where(eq(calendarBlackouts.id, id));
    return this.blackouts(viewer);
  }

  // ─── Geography ──────────────────────────────────────────────────────────────────────────────

  async cities(viewer: Viewer | null): Promise<OpsCity[]> {
    requireStaff(viewer);
    const rows = await this.db
      .select({
        c: cities,
        pincodes: sql<number>`(select count(*)::int from pincodes p where p.city_id = "cities"."id")`,
        vendors: sql<number>`(select count(*)::int from vendors v where v.city_id = "cities"."id")`,
        lanesFrom: sql<number>`(select count(*)::int from serviceability_matrix sm where sm.origin_city_id = "cities"."id" and sm.is_active)`,
      })
      .from(cities)
      .orderBy(asc(cities.sortOrder));
    return rows.map((r) => ({
      id: r.c.id,
      slug: r.c.slug,
      name: r.c.name,
      stateCode: r.c.stateCode,
      isOrigin: r.c.isOrigin,
      isDestination: r.c.isDestination,
      launchStatus: r.c.launchStatus,
      pincodes: r.pincodes,
      vendors: r.vendors,
      lanesFrom: r.lanesFrom,
    }));
  }

  /** Launching or pausing a city is a data change, never a deploy. */
  async updateCity(
    viewer: Viewer | null,
    id: string,
    patch: UpdateCityRequest,
  ): Promise<OpsCity[]> {
    requireStaff(viewer);
    const updated = await this.db
      .update(cities)
      .set(patch)
      .where(eq(cities.id, id))
      .returning({ id: cities.id });
    if (updated.length === 0) throw notFound("City");
    invalidateReference();
    return this.cities(viewer);
  }

  async vendors(viewer: Viewer | null): Promise<OpsVendor[]> {
    requireStaff(viewer);
    const monthAgo = sql`${new Date(this.deps.clock().getTime() - 30 * 86_400_000).toISOString()}::timestamptz`;
    const soon = addDays(istDateOf(this.deps.clock()), 60);
    const rows = await this.db
      .select({
        v: vendors,
        city: cities.name,
        activeItems: sql<number>`(select count(*)::int from items i where i.vendor_id = "vendors"."id" and i.status = 'ACTIVE')`,
        shipped: sql<number>`(select count(*)::int from shipments s where s.vendor_id = "vendors"."id" and s.created_at >= ${monthAgo} and s.status not in ('PENDING_PAYMENT', 'CANCELLED'))`,
        failed: sql<number>`(select count(*)::int from shipments s where s.vendor_id = "vendors"."id" and s.created_at >= ${monthAgo} and s.status = 'FAILED')`,
      })
      .from(vendors)
      .innerJoin(cities, eq(cities.id, vendors.cityId))
      .orderBy(asc(cities.sortOrder), asc(vendors.name));
    return rows.map((r) => ({
      id: r.v.id,
      slug: r.v.slug,
      name: r.v.name,
      city: r.city,
      status: r.v.status,
      fssaiLicenseNo: r.v.fssaiLicenseNo,
      fssaiValidUntil: r.v.fssaiValidUntil,
      fssaiExpiringSoon: r.v.fssaiValidUntil <= soon,
      commissionBps: r.v.commissionBps,
      dailyShipmentCap: r.v.dailyShipmentCap,
      activeItems: r.activeItems,
      shipmentsLast30d: r.shipped,
      failureRateLast30d: r.shipped > 0 ? r.failed / r.shipped : null,
    }));
  }

  async updateVendor(
    viewer: Viewer | null,
    id: string,
    patch: UpdateVendorRequest,
  ): Promise<OpsVendor[]> {
    requireStaff(viewer);
    const updated = await this.db
      .update(vendors)
      .set(patch)
      .where(eq(vendors.id, id))
      .returning({ id: vendors.id });
    if (updated.length === 0) throw notFound("Kitchen");
    return this.vendors(viewer);
  }

  async recentOutboxFailures(viewer: Viewer | null) {
    requireStaff(viewer);
    return this.db
      .select()
      .from(outbox)
      .where(eq(outbox.status, "FAILED"))
      .orderBy(desc(outbox.createdAt))
      .limit(50);
  }
}
