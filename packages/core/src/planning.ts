/**
 * Loads everything the pure planner needs from Postgres and assembles `PlanningContext`s.
 * One loader serves one request: vendor and destination data are cached for its lifetime, so a
 * catalogue page with 30 items costs a handful of queries, not hundreds.
 */
import { type Executor, schema } from "@food-del/db";
import {
  addDays,
  type Blackouts,
  type Destination,
  istDateOf,
  type Lane,
  type LocalDate,
  type PackagingProfile,
  type PlanningContext,
  type RateCard,
  type ShipmentLine,
  type VendorSchedule,
} from "@food-del/domain";
import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { CoreDeps } from "./deps";

const {
  calendarBlackouts,
  cities,
  inventorySlots,
  packagingProfiles,
  pincodes,
  rateCards,
  serviceabilityMatrix,
  shipments,
  vendors,
} = schema;

/** "18:00:00" → "18:00" */
const hhmm = (t: string) => t.slice(0, 5);

export interface DestinationInfo {
  pincode: string;
  district: string;
  stateCode: string;
  isOda: boolean;
  city: {
    id: string;
    slug: string;
    name: string;
    isDestination: boolean;
    launchStatus: string;
  } | null;
}

export interface VendorRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  establishedYear: number | null;
  cityId: string;
  citySlug: string;
  cityName: string;
  status: string;
  schedule: VendorSchedule;
}

interface ReferenceData {
  packaging: PackagingProfile[];
  packagingNames: Map<string, { name: string; coolant: string }>;
  rateCards: RateCard[];
  loadedAt: number;
}

let referenceCache: ReferenceData | null = null;
const REFERENCE_TTL_MS = 60_000;

/** Packaging profiles and rate cards change rarely; cache them per process for a minute. */
export async function loadReference(db: Executor, now = Date.now()): Promise<ReferenceData> {
  if (referenceCache && now - referenceCache.loadedAt < REFERENCE_TTL_MS) return referenceCache;
  const [pkgRows, rateRows] = await Promise.all([
    db.select().from(packagingProfiles),
    db.select().from(rateCards),
  ]);
  referenceCache = {
    packaging: pkgRows
      .filter((p) => p.isActive)
      .map((p) => ({
        code: p.code,
        name: p.name,
        tempClass: p.tempClass,
        coolant: p.coolant,
        maxHoldHours: p.maxHoldHours,
        isDangerousGoods: p.isDangerousGoods,
        outerDimsMm: [p.outerLengthMm, p.outerBreadthMm, p.outerHeightMm] as const,
        tareWeightG: p.tareWeightG,
        maxPayloadG: p.maxPayloadG,
        costPaise: p.costPaise,
      })),
    packagingNames: new Map(pkgRows.map((p) => [p.code, { name: p.name, coolant: p.coolant }])),
    rateCards: rateRows.map((r) => ({
      carrierCode: r.carrierCode,
      mode: r.mode,
      zone: r.zone,
      volumetricDivisor: r.volumetricDivisor,
      firstSlabG: r.firstSlabG,
      firstSlabPaise: r.firstSlabPaise,
      addlSlabG: r.addlSlabG,
      addlSlabPaise: r.addlSlabPaise,
      fuelSurchargeBps: r.fuelSurchargeBps,
      odaSurchargePaise: r.odaSurchargePaise,
    })),
    loadedAt: now,
  };
  return referenceCache;
}

/** Drop cached reference data (after ops edits packaging or rate cards). */
export function invalidateReference(): void {
  referenceCache = null;
}

export function vendorScheduleOf(v: typeof vendors.$inferSelect): VendorSchedule {
  return {
    id: v.id,
    orderCutoffLocal: hhmm(v.orderCutoffLocal),
    prepLeadDays: v.prepLeadDays,
    prepStartLocal: hhmm(v.prepStartLocal),
    readyForPickupLocal: hhmm(v.readyForPickupLocal),
    dispatchWeekdays: v.dispatchWeekdays,
    dailyShipmentCap: v.dailyShipmentCap,
  };
}

export async function loadDestination(
  db: Executor,
  pincode: string,
): Promise<DestinationInfo | null> {
  const rows = await db
    .select({ p: pincodes, c: cities })
    .from(pincodes)
    .leftJoin(cities, eq(cities.id, pincodes.cityId))
    .where(eq(pincodes.pincode, pincode))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    pincode: row.p.pincode,
    district: row.p.district,
    stateCode: row.p.stateCode,
    isOda: row.p.isOda,
    city: row.c
      ? {
          id: row.c.id,
          slug: row.c.slug,
          name: row.c.name,
          isDestination: row.c.isDestination,
          launchStatus: row.c.launchStatus,
        }
      : null,
  };
}

/** Why a destination can't receive from an origin city, or null when it can. */
export function destinationProblem(
  dest: DestinationInfo | null,
  originCityId: string | null,
): "UNKNOWN_PINCODE" | "DESTINATION_NOT_LIVE" | "SAME_CITY" | null {
  if (!dest) return "UNKNOWN_PINCODE";
  if (!dest.city?.isDestination || dest.city.launchStatus !== "LIVE") {
    return "DESTINATION_NOT_LIVE";
  }
  if (originCityId && dest.city.id === originCityId) return "SAME_CITY";
  return null;
}

export class PlanningLoader {
  private readonly vendorCache = new Map<string, Promise<VendorRow>>();
  private readonly laneCache = new Map<string, Promise<Lane[]>>();
  private readonly blackoutCache = new Map<string, Promise<Blackouts>>();
  private readonly bookedCache = new Map<string, Promise<Map<LocalDate, number>>>();
  private readonly destCache = new Map<string, Promise<DestinationInfo | null>>();
  readonly now: Date;
  readonly today: LocalDate;
  readonly horizonEnd: LocalDate;

  constructor(
    private readonly db: Executor,
    private readonly deps: Pick<CoreDeps, "clock" | "config">,
  ) {
    this.now = deps.clock();
    this.today = istDateOf(this.now);
    this.horizonEnd = addDays(this.today, deps.config.planning.horizonDays + 1);
  }

  destination(pincode: string): Promise<DestinationInfo | null> {
    let p = this.destCache.get(pincode);
    if (!p) {
      p = loadDestination(this.db, pincode);
      this.destCache.set(pincode, p);
    }
    return p;
  }

  vendor(vendorId: string): Promise<VendorRow> {
    let p = this.vendorCache.get(vendorId);
    if (!p) {
      p = this.db
        .select({ v: vendors, c: cities })
        .from(vendors)
        .innerJoin(cities, eq(cities.id, vendors.cityId))
        .where(eq(vendors.id, vendorId))
        .then(([row]) => {
          if (!row) throw new Error(`vendor ${vendorId} missing`);
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
          };
        });
      this.vendorCache.set(vendorId, p);
    }
    return p;
  }

  private lanes(originCityId: string, pincode: string): Promise<Lane[]> {
    const key = `${originCityId}|${pincode}`;
    let p = this.laneCache.get(key);
    if (!p) {
      p = this.db
        .select()
        .from(serviceabilityMatrix)
        .where(
          and(
            eq(serviceabilityMatrix.originCityId, originCityId),
            eq(serviceabilityMatrix.destPincode, pincode),
            eq(serviceabilityMatrix.isActive, true),
          ),
        )
        .then((rows) =>
          rows.map((r) => ({
            carrierCode: r.carrierCode,
            mode: r.mode,
            transitHoursP50: r.transitHoursP50,
            transitHoursP90: r.transitHoursP90,
            pickupCutoffLocal: hhmm(r.pickupCutoffLocal),
            deliversSunday: r.deliversSunday,
            acceptsDryIce: r.acceptsDryIce,
            rateZone: r.rateZone,
          })),
        );
      this.laneCache.set(key, p);
    }
    return p;
  }

  private blackouts(vendor: VendorRow): Promise<Blackouts> {
    let p = this.blackoutCache.get(vendor.id);
    if (!p) {
      // Carrier holidays can push deliveries past the dispatch horizon; look a little further.
      const until = addDays(this.horizonEnd, 14);
      p = this.db
        .select()
        .from(calendarBlackouts)
        .where(and(gte(calendarBlackouts.date, this.today), lte(calendarBlackouts.date, until)))
        .then((rows) => {
          const dispatch = new Set<LocalDate>();
          const carrier = new Map<string, Set<LocalDate>>();
          for (const r of rows) {
            if (
              r.scope === "NATIONAL" ||
              (r.scope === "CITY" && r.scopeRef === vendor.cityId) ||
              (r.scope === "VENDOR" && r.scopeRef === vendor.id)
            ) {
              dispatch.add(r.date);
            } else if (r.scope === "CARRIER") {
              let set = carrier.get(r.scopeRef);
              if (!set) {
                set = new Set();
                carrier.set(r.scopeRef, set);
              }
              set.add(r.date);
            }
          }
          return { dispatch, carrier };
        });
      this.blackoutCache.set(vendor.id, p);
    }
    return p;
  }

  private booked(vendorId: string): Promise<Map<LocalDate, number>> {
    let p = this.bookedCache.get(vendorId);
    if (!p) {
      p = this.db
        .select({ date: shipments.dispatchDate, n: sql<number>`count(*)::int` })
        .from(shipments)
        .where(
          and(
            eq(shipments.vendorId, vendorId),
            gte(shipments.dispatchDate, this.today),
            lte(shipments.dispatchDate, this.horizonEnd),
            ne(shipments.status, "CANCELLED"),
          ),
        )
        .groupBy(shipments.dispatchDate)
        .then((rows) => new Map(rows.map((r) => [r.date, r.n])));
      this.bookedCache.set(vendorId, p);
    }
    return p;
  }

  /** Units still sellable per (variant, dispatch date) within the horizon. */
  async availability(
    variantIds: string[],
  ): Promise<(variantId: string, date: LocalDate) => number> {
    if (variantIds.length === 0) return () => 0;
    const rows = await this.db
      .select({
        variantId: inventorySlots.variantId,
        date: inventorySlots.dispatchDate,
        free: sql<number>`(${inventorySlots.capacity} - ${inventorySlots.reserved} - ${inventorySlots.sold})::int`,
      })
      .from(inventorySlots)
      .where(
        and(
          inArray(inventorySlots.variantId, variantIds),
          gte(inventorySlots.dispatchDate, this.today),
          lte(inventorySlots.dispatchDate, this.horizonEnd),
        ),
      );
    const map = new Map(rows.map((r) => [`${r.variantId}|${r.date}`, r.free]));
    return (variantId, date) => map.get(`${variantId}|${date}`) ?? 0;
  }

  /** A complete planning context for one vendor's parcel to one pincode. */
  async context(
    vendorId: string,
    dest: DestinationInfo,
    lines: ShipmentLine[],
    availability?: (variantId: string, date: LocalDate) => number,
  ): Promise<PlanningContext> {
    const vendor = await this.vendor(vendorId);
    const [lanes, blackouts, booked, reference, avail] = await Promise.all([
      this.lanes(vendor.cityId, dest.pincode),
      this.blackouts(vendor),
      this.booked(vendor.id),
      loadReference(this.db, this.now.getTime()),
      availability ?? this.availability(lines.map((l) => l.variantId)),
    ]);
    const destination: Destination = { pincode: dest.pincode, isOda: dest.isOda };
    return {
      now: this.now,
      vendor: vendor.schedule,
      destination,
      lines,
      lanes,
      packaging: reference.packaging,
      rateCards: reference.rateCards,
      blackouts,
      availableUnits: avail,
      bookedShipments: (d) => booked.get(d) ?? 0,
      policy: this.deps.config.planning,
    };
  }
}
