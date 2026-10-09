import { type Executor, schema } from "@food-del/db";
import {
  addDays,
  addHours,
  atIst,
  dateRange,
  isoWeekday,
  istDateOf,
  isWeekdayInMask,
  type LocalDate,
  SHIPMENT_STATUS_LABELS,
  timelinePosition,
} from "@food-del/domain";
import type {
  InventoryGrid,
  InventoryUpdateRequest,
  VendorDay,
  VendorOverview,
  VendorShipment,
} from "@food-del/domain/contracts";
import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { CoreDeps } from "../deps";
import { conflict, invalid, notFound } from "../errors";
import { iso, vendorSummary } from "../mappers";
import { loadReference, type VendorRow, vendorScheduleOf } from "../planning";
import { requireVendorAccess, type Viewer } from "../viewer";
import { createRefund, shipmentChargePaise } from "./orders";
import type { OutboxProcessor } from "./outbox";
import { enqueue, transitionShipment } from "./shipments";

const {
  calendarBlackouts,
  cities,
  dispatchBatches,
  inventorySlots,
  items,
  itemVariants,
  orderItems,
  orders,
  shipments,
  vendorPayouts,
  vendors,
} = schema;

/** Statuses a vendor sees on its dispatch board (paid, not cancelled). */
const BOARD_STATUSES = [
  "PLACED",
  "BATCHED",
  "PACKED_COLD_CHAIN",
  "PICKED_UP",
  "IN_TRANSIT_INTERCITY",
  "AT_DESTINATION_HUB",
  "OUT_FOR_LOCAL_DELIVERY",
  "DELIVERY_ATTEMPT_FAILED",
  "DELIVERED",
  "FAILED",
] as const;

export class FulfilmentService {
  private outbox: OutboxProcessor | null = null;

  constructor(private readonly deps: CoreDeps) {}

  /** The outbox depends on this service, so it is attached after both are built. */
  attachOutbox(outbox: OutboxProcessor): void {
    this.outbox = outbox;
  }

  private get db() {
    return this.deps.db;
  }

  private async vendorRow(
    vendorId: string,
  ): Promise<VendorRow & { raw: typeof vendors.$inferSelect }> {
    const [row] = await this.db
      .select({ v: vendors, c: cities })
      .from(vendors)
      .innerJoin(cities, eq(cities.id, vendors.cityId))
      .where(eq(vendors.id, vendorId));
    if (!row) throw notFound("Kitchen");
    return {
      id: row.v.id,
      slug: row.v.slug,
      name: row.v.name,
      tagline: row.v.tagline,
      establishedYear: row.v.establishedYear,
      cityId: row.v.cityId,
      citySlug: row.c.slug,
      cityName: row.c.name,
      status: row.v.status,
      schedule: vendorScheduleOf(row.v),
      raw: row.v,
    };
  }

  /**
   * Cutoff job: every paid parcel whose order window has closed joins its kitchen's dispatch batch
   * for the day (one batch per kitchen, day and courier) and can no longer be cancelled.
   */
  async lockDueBatches(limit = 500): Promise<number> {
    const now = this.deps.clock();
    return this.db.transaction(async (tx) => {
      const due = await tx
        .select({
          id: shipments.id,
          vendorId: shipments.vendorId,
          dispatchDate: shipments.dispatchDate,
          carrierCode: shipments.carrierCode,
          orderId: shipments.orderId,
        })
        .from(shipments)
        .where(and(eq(shipments.status, "PLACED"), lte(shipments.orderCutoffAt, now)))
        .limit(limit)
        .for("update", { skipLocked: true });
      const batchIds = new Map<string, string>();
      for (const s of due) {
        const key = `${s.vendorId}|${s.dispatchDate}|${s.carrierCode}`;
        let batchId = batchIds.get(key);
        if (!batchId) {
          const [b] = await tx
            .insert(dispatchBatches)
            .values({
              vendorId: s.vendorId,
              dispatchDate: s.dispatchDate,
              carrierCode: s.carrierCode,
              lockedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                dispatchBatches.vendorId,
                dispatchBatches.dispatchDate,
                dispatchBatches.carrierCode,
              ],
              set: { lockedAt: sql`${dispatchBatches.lockedAt}` },
            })
            .returning({ id: dispatchBatches.id });
          batchId = b!.id;
          batchIds.set(key, batchId);
        }
        await transitionShipment(tx, {
          shipmentId: s.id,
          to: "BATCHED",
          actor: "SYSTEM",
          note: "Order window closed; in the kitchen's batch",
          patch: { batchId },
          now,
        });
      }
      const vendorDays = new Set(due.map((s) => `${s.vendorId}|${s.dispatchDate}`));
      for (const vd of vendorDays) {
        const [vendorId, date] = vd.split("|") as [string, string];
        const anyOrder = due.find((s) => s.vendorId === vendorId && s.dispatchDate === date)!;
        await enqueue(tx, {
          topic: "notify",
          payload: {
            template: "VENDOR_BATCH_LOCKED",
            orderId: anyOrder.orderId,
            extra: { vendorId, date },
          },
        });
      }
      return due.length;
    });
  }

  async myVendors(viewer: Viewer | null): Promise<{ id: string; slug: string; name: string }[]> {
    if (!viewer) return [];
    const staff = viewer.roles.includes("OPS") || viewer.roles.includes("ADMIN");
    const rows = await this.db
      .select({ id: vendors.id, slug: vendors.slug, name: vendors.name })
      .from(vendors)
      .where(
        staff
          ? undefined
          : inArray(
              vendors.id,
              viewer.vendorIds.length ? viewer.vendorIds : ["00000000-0000-0000-0000-000000000000"],
            ),
      )
      .orderBy(asc(vendors.name));
    return rows;
  }

  async overview(viewerIn: Viewer | null, vendorId: string): Promise<VendorOverview> {
    requireVendorAccess(viewerIn, vendorId);
    const vendor = await this.vendorRow(vendorId);
    const today = istDateOf(this.deps.clock());
    const until = addDays(today, 7);
    const rows = await this.db
      .select({
        date: shipments.dispatchDate,
        shipments: sql<number>`count(distinct ${shipments.id})::int`,
        units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
      })
      .from(shipments)
      .innerJoin(orderItems, eq(orderItems.shipmentId, shipments.id))
      .where(
        and(
          eq(shipments.vendorId, vendorId),
          gte(shipments.dispatchDate, today),
          lte(shipments.dispatchDate, until),
          inArray(shipments.status, [...BOARD_STATUSES]),
        ),
      )
      .groupBy(shipments.dispatchDate);
    const byDate = new Map(rows.map((r) => [r.date, r]));
    const [payouts] = await this.db
      .select({
        onHold: sql<number>`coalesce(sum(${vendorPayouts.netPaise}) filter (where ${vendorPayouts.status} = 'ON_HOLD'), 0)::int`,
        released: sql<number>`coalesce(sum(${vendorPayouts.netPaise}) filter (where ${vendorPayouts.status} = 'RELEASED'), 0)::int`,
      })
      .from(vendorPayouts)
      .where(eq(vendorPayouts.vendorId, vendorId));
    const blackouts = await this.db
      .select({
        date: calendarBlackouts.date,
        scope: calendarBlackouts.scope,
        ref: calendarBlackouts.scopeRef,
      })
      .from(calendarBlackouts)
      .where(and(gte(calendarBlackouts.date, today), lte(calendarBlackouts.date, until)));
    const closedDates = new Set(
      blackouts
        .filter(
          (b) =>
            b.scope === "NATIONAL" ||
            (b.scope === "CITY" && b.ref === vendor.cityId) ||
            (b.scope === "VENDOR" && b.ref === vendor.id),
        )
        .map((b) => b.date),
    );
    return {
      vendor: vendorSummary(vendor),
      upcoming: dateRange(today, until).map((date) => ({
        date,
        shipments: byDate.get(date)?.shipments ?? 0,
        units: byDate.get(date)?.units ?? 0,
        cutoffAt: iso(
          atIst(addDays(date, -vendor.schedule.prepLeadDays), vendor.schedule.orderCutoffLocal),
        ),
        closed:
          !isWeekdayInMask(vendor.schedule.dispatchWeekdays, isoWeekday(date)) ||
          closedDates.has(date),
      })),
      payouts: {
        onHoldPaise: payouts?.onHold ?? 0,
        releasedPaise: payouts?.released ?? 0,
        accountLinked: Boolean(vendor.raw.payoutAccountRef),
      },
    };
  }

  /** Everything a kitchen needs for one dispatch day: what to make, what to pack, who's collecting. */
  async day(viewerIn: Viewer | null, vendorId: string, date: LocalDate): Promise<VendorDay> {
    requireVendorAccess(viewerIn, vendorId);
    const vendor = await this.vendorRow(vendorId);
    const now = this.deps.clock();
    const reference = await loadReference(this.db);

    const rows = await this.db
      .select({ s: shipments, o: orders })
      .from(shipments)
      .innerJoin(orders, eq(orders.id, shipments.orderId))
      .where(
        and(
          eq(shipments.vendorId, vendorId),
          eq(shipments.dispatchDate, date),
          inArray(shipments.status, [...BOARD_STATUSES]),
        ),
      )
      .orderBy(asc(orders.createdAt));
    const ids = rows.map((r) => r.s.id);
    const lines = ids.length
      ? await this.db
          .select({ i: orderItems, item: items })
          .from(orderItems)
          .innerJoin(itemVariants, eq(itemVariants.id, orderItems.variantId))
          .innerJoin(items, eq(items.id, itemVariants.itemId))
          .where(inArray(orderItems.shipmentId, ids))
      : [];
    const batches = await this.db
      .select()
      .from(dispatchBatches)
      .where(and(eq(dispatchBatches.vendorId, vendorId), eq(dispatchBatches.dispatchDate, date)));

    const production = new Map<string, VendorDay["production"][number]>();
    for (const { i, item } of lines) {
      const shipment = rows.find((r) => r.s.id === i.shipmentId)?.s;
      if (!shipment || shipment.status === "FAILED") continue;
      const prev = production.get(i.variantId);
      production.set(i.variantId, {
        variantId: i.variantId,
        itemName: i.snapshot.itemName,
        variantLabel: i.snapshot.variantLabel,
        tempClass: item.tempClass,
        quantity: (prev?.quantity ?? 0) + i.quantity,
      });
    }

    const packagingCount = new Map<string, number>();
    for (const { s } of rows) {
      if (s.status === "FAILED") continue;
      packagingCount.set(s.packagingCode, (packagingCount.get(s.packagingCode) ?? 0) + 1);
    }

    const cutoffAt = atIst(
      addDays(date, -vendor.schedule.prepLeadDays),
      vendor.schedule.orderCutoffLocal,
    );
    const vendorShipments: VendorShipment[] = rows.map(({ s, o }) =>
      this.vendorShipment(
        s,
        o,
        lines.filter((l) => l.i.shipmentId === s.id).map((l) => l.i),
        reference.packagingNames,
      ),
    );
    const handedOverPos = timelinePosition("PICKED_UP") ?? 3;
    return {
      vendor: vendorSummary(vendor),
      date,
      orderCutoffAt: iso(cutoffAt),
      readyForPickupLocal: vendor.schedule.readyForPickupLocal,
      isLocked: now.getTime() >= cutoffAt.getTime(),
      batches: batches.map((b) => ({
        id: b.id,
        carrierCode: b.carrierCode,
        status: b.status,
        pickupRef: b.pickupRef,
      })),
      production: [...production.values()].sort((a, b) => a.itemName.localeCompare(b.itemName)),
      packagingNeeded: [...packagingCount.entries()].map(([code, count]) => ({
        code,
        name: reference.packagingNames.get(code)?.name ?? code,
        count,
      })),
      shipments: vendorShipments,
      counts: {
        total: vendorShipments.filter((s) => s.status !== "FAILED").length,
        packed: vendorShipments.filter((s) => (timelinePosition(s.status) ?? -1) >= 2).length,
        handedOver: vendorShipments.filter(
          (s) => (timelinePosition(s.status) ?? -1) >= handedOverPos,
        ).length,
      },
    };
  }

  private vendorShipment(
    s: typeof shipments.$inferSelect,
    o: typeof orders.$inferSelect,
    lines: (typeof orderItems.$inferSelect)[],
    packaging: Map<string, { name: string; coolant: string }>,
  ): VendorShipment {
    const pkg = packaging.get(s.packagingCode);
    return {
      id: s.id,
      orderNumber: o.orderNumber,
      status: s.status,
      statusLabel: SHIPMENT_STATUS_LABELS[s.status],
      packagingCode: s.packagingCode,
      packagingName: pkg?.name ?? s.packagingCode,
      coolant: pkg?.coolant ?? "NONE",
      mode: s.mode,
      carrierCode: s.carrierCode,
      promisedDeliveryDate: s.promisedDeliveryDate,
      deliverByAt: iso(s.deliverByAt),
      destCity: o.shipTo.cityName,
      destPincode: o.shipTo.pincode,
      // Kitchens see the recipient's first name only; the courier label carries the rest.
      recipientName: o.shipTo.recipientName.split(/\s+/)[0] ?? "",
      isGift: o.isGift,
      lines: lines.map((l) => ({
        itemName: l.snapshot.itemName,
        variantLabel: l.snapshot.variantLabel,
        quantity: l.quantity,
      })),
      awbNumber: s.awbNumber,
      labelUrl: s.labelUrl,
      canPack: s.status === "BATCHED",
      canReportShortfall: s.status === "BATCHED",
    };
  }

  private async shipmentForVendor(viewer: Viewer | null, shipmentId: string) {
    const [s] = await this.db.select().from(shipments).where(eq(shipments.id, shipmentId));
    if (!s) throw notFound("Parcel");
    const v = requireVendorAccess(viewer, s.vendorId);
    return { shipment: s, viewer: v };
  }

  /**
   * The parcel is packed with the planned box and coolant. Records when the food was actually
   * made, recomputes the spoilage deadline from it, and books the courier.
   */
  async markPacked(
    viewerIn: Viewer | null,
    shipmentId: string,
    input: { preparedAt?: string },
  ): Promise<VendorShipment> {
    const { shipment, viewer } = await this.shipmentForVendor(viewerIn, shipmentId);
    const now = this.deps.clock();
    const actor = viewer.vendorIds.includes(shipment.vendorId) ? "VENDOR" : "OPS";
    await this.db.transaction(async (tx) => {
      const lines = await tx.select().from(orderItems).where(eq(orderItems.shipmentId, shipmentId));
      let preparedAt: Date | null = null;
      let deliverByAt = shipment.deliverByAt;
      if (input.preparedAt) {
        preparedAt = new Date(input.preparedAt);
        if (Number.isNaN(preparedAt.getTime()) || preparedAt.getTime() > now.getTime()) {
          throw invalid("INVALID_PREPARED_AT", "Preparation time must be in the past.");
        }
        const deadlines = lines.map((l) =>
          addHours(preparedAt!, l.snapshot.shelfLifeHours - l.snapshot.minResidualHours).getTime(),
        );
        deliverByAt = new Date(Math.min(...deadlines));
      }
      await transitionShipment(tx, {
        shipmentId,
        to: "PACKED_COLD_CHAIN",
        actor,
        actorId: viewer.userId,
        expectFrom: ["BATCHED"],
        patch: { packedAt: now, preparedAt, deliverByAt },
        now,
      });
      await enqueue(tx, { topic: "carrier.book", payload: { shipmentId } });
    });
    // Book now so the kitchen can print the label while the box is on the counter. A courier
    // failure is logged and left to the outbox's retries; the parcel is packed either way.
    await this.outbox?.processFor("carrier.book", { shipmentId }).catch((e: unknown) => {
      this.deps.logger.warn("immediate courier booking failed", {
        shipmentId,
        error: e instanceof Error ? e.message : String(e),
      });
    });
    return this.loadVendorShipment(shipmentId);
  }

  /** The kitchen can't make this parcel: it fails, and the customer is refunded in full. */
  async reportShortfall(
    viewerIn: Viewer | null,
    shipmentId: string,
    note: string,
  ): Promise<VendorShipment> {
    const { shipment, viewer } = await this.shipmentForVendor(viewerIn, shipmentId);
    const now = this.deps.clock();
    const actor = viewer.vendorIds.includes(shipment.vendorId) ? "VENDOR" : "OPS";
    await this.db.transaction(async (tx) => {
      const { after } = await transitionShipment(tx, {
        shipmentId,
        to: "FAILED",
        actor,
        actorId: viewer.userId,
        failureReason: "VENDOR_UNFULFILLED",
        expectFrom: ["BATCHED"],
        note,
        now,
      });
      await createRefund(tx, {
        orderId: after.orderId,
        shipmentId,
        amountPaise: shipmentChargePaise(after),
        reason: "Kitchen could not fulfil",
      });
      await enqueue(tx, {
        topic: "notify",
        payload: { template: "SHIPMENT_FAILED", orderId: after.orderId, shipmentId },
      });
    });
    return this.loadVendorShipment(shipmentId);
  }

  private async loadVendorShipment(shipmentId: string): Promise<VendorShipment> {
    const [row] = await this.db
      .select({ s: shipments, o: orders })
      .from(shipments)
      .innerJoin(orders, eq(orders.id, shipments.orderId))
      .where(eq(shipments.id, shipmentId));
    if (!row) throw notFound("Parcel");
    const lines = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.shipmentId, shipmentId));
    const reference = await loadReference(this.db);
    return this.vendorShipment(row.s, row.o, lines, reference.packagingNames);
  }

  /** Daily caps per variant for the coming days. */
  async inventory(
    viewerIn: Viewer | null,
    vendorId: string,
    from?: LocalDate,
    days = 14,
  ): Promise<InventoryGrid> {
    requireVendorAccess(viewerIn, vendorId);
    const start = from ?? istDateOf(this.deps.clock());
    const dates = dateRange(start, addDays(start, days - 1));
    const variants = await this.db
      .select({ v: itemVariants, item: items })
      .from(itemVariants)
      .innerJoin(items, eq(items.id, itemVariants.itemId))
      .where(
        and(
          eq(items.vendorId, vendorId),
          ne(items.status, "ARCHIVED"),
          eq(itemVariants.isActive, true),
        ),
      )
      .orderBy(asc(items.name), asc(itemVariants.sortOrder));
    const slots = variants.length
      ? await this.db
          .select()
          .from(inventorySlots)
          .where(
            and(
              inArray(
                inventorySlots.variantId,
                variants.map((v) => v.v.id),
              ),
              gte(inventorySlots.dispatchDate, dates[0]!),
              lte(inventorySlots.dispatchDate, dates[dates.length - 1]!),
            ),
          )
      : [];
    const byKey = new Map(slots.map((s) => [`${s.variantId}|${s.dispatchDate}`, s]));
    return {
      vendorId,
      dates,
      rows: variants.map(({ v, item }) => ({
        variantId: v.id,
        itemName: item.name,
        variantLabel: v.label,
        defaultDailyCap: v.defaultDailyCap,
        cells: dates.map((d) => {
          const s = byKey.get(`${v.id}|${d}`);
          return s ? { date: d, capacity: s.capacity, reserved: s.reserved, sold: s.sold } : null;
        }),
      })),
    };
  }

  /** Set daily caps. A cap can't drop below what's already sold or held. */
  async updateInventory(
    viewerIn: Viewer | null,
    vendorId: string,
    req: InventoryUpdateRequest,
  ): Promise<InventoryGrid> {
    requireVendorAccess(viewerIn, vendorId);
    const variantIds = [...new Set(req.cells.map((c) => c.variantId))];
    const owned = await this.db
      .select({ id: itemVariants.id })
      .from(itemVariants)
      .innerJoin(items, eq(items.id, itemVariants.itemId))
      .where(and(eq(items.vendorId, vendorId), inArray(itemVariants.id, variantIds)));
    if (owned.length !== variantIds.length)
      throw invalid("UNKNOWN_VARIANT", "Some items don't belong to this kitchen.");

    await this.db.transaction(async (tx) => {
      for (const c of req.cells) {
        const updated = await tx
          .insert(inventorySlots)
          .values({ variantId: c.variantId, dispatchDate: c.date, capacity: c.capacity })
          .onConflictDoUpdate({
            target: [inventorySlots.variantId, inventorySlots.dispatchDate],
            set: { capacity: c.capacity },
            setWhere: sql`${inventorySlots.reserved} + ${inventorySlots.sold} <= ${c.capacity}`,
          })
          .returning({ id: inventorySlots.id });
        if (updated.length === 0) {
          throw conflict(
            "CAPACITY_BELOW_SOLD",
            `Orders already exceed ${c.capacity} on ${c.date}.`,
            c,
          );
        }
      }
    });
    const first = [...req.cells].sort((a, b) => a.date.localeCompare(b.date))[0]!.date;
    return this.inventory(
      viewerIn,
      vendorId,
      first < istDateOf(this.deps.clock()) ? undefined : istDateOf(this.deps.clock()),
    );
  }

  /** Book the courier for a packed parcel (outbox handler). */
  async bookCarrier(tx: Executor, shipmentId: string): Promise<void> {
    const [row] = await tx
      .select({ s: shipments, o: orders, v: vendors, c: cities })
      .from(shipments)
      .innerJoin(orders, eq(orders.id, shipments.orderId))
      .innerJoin(vendors, eq(vendors.id, shipments.vendorId))
      .innerJoin(cities, eq(cities.id, vendors.cityId))
      .where(eq(shipments.id, shipmentId));
    if (!row) throw notFound("Parcel");
    if (row.s.awbNumber || row.s.status !== "PACKED_COLD_CHAIN") return;
    const lines = await tx.select().from(orderItems).where(eq(orderItems.shipmentId, shipmentId));
    const [pkg] = await tx
      .select()
      .from(schema.packagingProfiles)
      .where(eq(schema.packagingProfiles.code, row.s.packagingCode));
    const booked = await this.deps.carrier.book({
      reference: row.s.id,
      orderNumber: row.o.orderNumber,
      orderDate: row.o.createdAt,
      carrierCode: row.s.carrierCode,
      mode: row.s.mode,
      pickupLocation: this.deps.config.pickupLocationFor(row.v.slug),
      pickup: {
        name: row.v.name,
        phone: row.v.pickupAddress.contactPhone,
        line1: row.v.pickupAddress.line1,
        line2: row.v.pickupAddress.line2 ?? null,
        landmark: row.v.pickupAddress.landmark ?? null,
        city: row.c.name,
        stateCode: row.c.stateCode,
        pincode: row.v.pickupPincode,
      },
      drop: {
        name: row.o.shipTo.recipientName,
        phone: row.o.shipTo.phone,
        line1: row.o.shipTo.line1,
        line2: row.o.shipTo.line2 ?? null,
        landmark: row.o.shipTo.landmark ?? null,
        city: row.o.shipTo.cityName,
        stateCode: row.o.shipTo.stateCode,
        pincode: row.o.shipTo.pincode,
      },
      parcel: {
        deadWeightG: row.s.deadWeightG,
        lengthMm: pkg?.outerLengthMm ?? 250,
        breadthMm: pkg?.outerBreadthMm ?? 200,
        heightMm: pkg?.outerHeightMm ?? 120,
        isDangerousGoods: pkg?.isDangerousGoods ?? false,
      },
      items: lines.map((l) => ({
        name: `${l.snapshot.itemName} (${l.snapshot.variantLabel})`,
        sku: l.snapshot.sku,
        quantity: l.quantity,
        unitPricePaise: l.unitPricePaise,
        hsn: l.snapshot.hsnCode,
      })),
      declaredValuePaise: row.s.itemsTotalPaise,
    });
    await tx
      .update(shipments)
      .set({
        awbNumber: booked.awbNumber,
        carrierShipmentRef: booked.carrierShipmentRef,
        labelUrl: booked.labelUrl,
        trackingUrl: booked.trackingUrl,
        updatedAt: this.deps.clock(),
      })
      .where(eq(shipments.id, shipmentId));
    const pickup = await this.deps.carrier.schedulePickup([booked.carrierShipmentRef]);
    if (row.s.batchId && pickup.pickupRef) {
      await tx
        .update(dispatchBatches)
        .set({ pickupRef: pickup.pickupRef })
        .where(eq(dispatchBatches.id, row.s.batchId));
    }
    await enqueue(tx, {
      topic: "notify",
      payload: { template: "SHIPMENT_PACKED", orderId: row.o.id, shipmentId },
    });
  }
}
