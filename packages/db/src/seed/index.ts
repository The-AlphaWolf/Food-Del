import { istDateOf, validateFreshness } from "@food-del/domain";
import { sql } from "drizzle-orm";
import type { Database } from "../client";
import { materializeInventorySlots } from "../maintenance";
import {
  calendarBlackouts,
  categories,
  cities,
  items,
  itemVariants,
  memberships,
  packagingProfiles,
  pincodes,
  profiles,
  rateCards,
  serviceabilityMatrix,
  vendors,
} from "../schema";
import { CATEGORY_SEED, VENDOR_SEED } from "./data/catalog";
import { CITY_SEED, laneTemplates, NATIONAL_HOLIDAYS, UNLAUNCHED_PINCODES } from "./data/geo";
import { CARRIERS, PACKAGING_SEED, RATE_CARD_SEED } from "./data/logistics";
import { DEV_CUSTOMER, DEV_OPS, devVendorOwner } from "./data/users";

export { CATEGORY_SEED, VENDOR_SEED } from "./data/catalog";
export { CITY_SEED, laneTemplates, NATIONAL_HOLIDAYS } from "./data/geo";
export { DEV_CUSTOMER, DEV_OPS, devVendorOwner } from "./data/users";

export interface SeedOptions {
  today: Date;
  /** Days of inventory slots to open. */
  slotDays?: number;
  /** Seed demo accounts (dev login). Off in production. */
  withDevUsers?: boolean;
}

export interface SeedSummary {
  skipped?: true;
  cities: number;
  pincodes: number;
  vendors: number;
  items: number;
  variants: number;
  lanes: number;
  slots: number;
}

async function insertInChunks<T>(
  rows: T[],
  size: number,
  insert: (chunk: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

/** Load the launch catalogue and logistics reference data into an empty database. */
export async function seed(db: Database, options: SeedOptions): Promise<SeedSummary> {
  const existing = await db.select({ id: cities.id }).from(cities).limit(1);
  if (existing.length > 0) {
    return {
      skipped: true,
      cities: 0,
      pincodes: 0,
      vendors: 0,
      items: 0,
      variants: 0,
      lanes: 0,
      slots: 0,
    };
  }

  // Refuse to seed food that could never be delivered fresh.
  for (const v of VENDOR_SEED) {
    for (const it of v.items) {
      const issues = validateFreshness({
        tempClass: it.temp,
        shelfLifeHours: it.shelfLifeHours,
        minResidualHours: it.minResidualHours,
        madeToOrder: it.stockMaxAgeHours === undefined,
        maxAgeAtDispatchHours: it.stockMaxAgeHours ?? null,
      });
      if (issues.length > 0) throw new Error(`Seed item ${it.slug}: ${issues.join(" ")}`);
    }
  }

  return db.transaction(async (tx) => {
    // Geography ---------------------------------------------------------------------------------
    const cityRows = await tx
      .insert(cities)
      .values(
        CITY_SEED.map((c) => ({
          slug: c.slug,
          name: c.name,
          stateCode: c.stateCode,
          airportIata: c.airportIata,
          isOrigin: c.isOrigin,
          isDestination: true,
          launchStatus: "LIVE" as const,
          tagline: c.tagline,
          sortOrder: c.sortOrder,
        })),
      )
      .returning({ id: cities.id, slug: cities.slug });
    const cityId = new Map(cityRows.map((c) => [c.slug, c.id]));

    const pincodeRows: (typeof pincodes.$inferInsert)[] = [];
    const pincodesByCity = new Map<string, string[]>();
    for (const c of CITY_SEED) {
      const list: string[] = [];
      for (const r of c.pincodeRanges) {
        for (let p = r.from; p <= r.to; p++) {
          const code = String(p);
          list.push(code);
          pincodeRows.push({
            pincode: code,
            cityId: cityId.get(c.slug)!,
            district: r.district,
            stateCode: r.stateCode ?? c.stateCode,
            // The outermost codes of each range stand in for courier ODA areas.
            isOda: p >= r.to - 1,
          });
        }
      }
      pincodesByCity.set(c.slug, list);
    }
    for (const u of UNLAUNCHED_PINCODES) pincodeRows.push({ ...u, cityId: null, isOda: false });
    await insertInChunks(pincodeRows, 1000, (chunk) => tx.insert(pincodes).values(chunk));

    // Logistics reference data ------------------------------------------------------------------
    await tx.insert(packagingProfiles).values(PACKAGING_SEED);
    await tx.insert(rateCards).values(RATE_CARD_SEED);

    const laneRows: (typeof serviceabilityMatrix.$inferInsert)[] = [];
    for (const origin of CITY_SEED.filter((c) => c.isOrigin)) {
      for (const dest of CITY_SEED) {
        if (dest.slug === origin.slug) continue;
        for (const t of laneTemplates(origin.slug, dest.slug)) {
          for (const pincode of pincodesByCity.get(dest.slug) ?? []) {
            laneRows.push({
              originCityId: cityId.get(origin.slug)!,
              destPincode: pincode,
              carrierCode: t.carrierCode,
              mode: t.mode,
              transitHoursP50: t.transitHoursP50,
              transitHoursP90: t.transitHoursP90,
              pickupCutoffLocal: t.pickupCutoffLocal,
              rateZone: t.rateZone,
              source: "MANUAL",
            });
          }
        }
      }
    }
    await insertInChunks(laneRows, 1000, (chunk) => tx.insert(serviceabilityMatrix).values(chunk));

    const blackoutRows = NATIONAL_HOLIDAYS.flatMap((h) => [
      { scope: "NATIONAL" as const, scopeRef: "", date: h.date, reason: h.reason },
      ...CARRIERS.map((c) => ({
        scope: "CARRIER" as const,
        scopeRef: c,
        date: h.date,
        reason: h.reason,
      })),
    ]);
    await tx.insert(calendarBlackouts).values(blackoutRows);

    // Catalogue ---------------------------------------------------------------------------------
    const categoryRows = await tx
      .insert(categories)
      .values(CATEGORY_SEED)
      .returning({ id: categories.id, slug: categories.slug });
    const categoryId = new Map(categoryRows.map((c) => [c.slug, c.id]));

    let itemCount = 0;
    let variantCount = 0;
    const vendorIds: { id: string; slug: string }[] = [];
    for (const v of VENDOR_SEED) {
      const [vendor] = await tx
        .insert(vendors)
        .values({
          cityId: cityId.get(v.city)!,
          slug: v.slug,
          name: v.name,
          tagline: v.tagline,
          story: v.story,
          establishedYear: v.established,
          pickupPincode: v.pickupPincode,
          pickupAddress: {
            line1: `${v.name}, near ${v.pickupPincode}`,
            contactName: "Dispatch desk",
            contactPhone: "+919800000000",
          },
          fssaiLicenseNo: v.fssai,
          fssaiValidUntil: "2028-03-31",
          gstin: v.gstin,
          orderCutoffLocal: v.orderCutoffLocal ?? "18:00",
          prepStartLocal: v.prepStartLocal ?? "06:00",
          readyForPickupLocal: v.readyForPickupLocal ?? "12:00",
          dispatchWeekdays: v.dispatchWeekdays ?? 63,
          dailyShipmentCap: v.dailyShipmentCap,
          commissionBps: v.commissionBps ?? 2000,
          status: "ACTIVE",
        })
        .returning({ id: vendors.id });
      vendorIds.push({ id: vendor!.id, slug: v.slug });

      for (const it of v.items) {
        const [item] = await tx
          .insert(items)
          .values({
            vendorId: vendor!.id,
            categoryId: categoryId.get(it.category)!,
            slug: it.slug,
            name: it.name,
            shortDescription: it.short,
            description: it.description,
            originStory: it.originStory ?? null,
            diet: it.diet,
            tempClass: it.temp,
            shelfLifeHours: it.shelfLifeHours,
            minResidualHours: it.minResidualHours,
            madeToOrder: it.stockMaxAgeHours === undefined,
            maxAgeAtDispatchHours: it.stockMaxAgeHours ?? null,
            hsnCode: it.hsn,
            gstRateBps: 500,
            legal: {
              manufacturer: `${v.name}, ${CITY_SEED.find((c) => c.slug === v.city)!.name}`,
              ingredients: it.ingredients,
              allergens: it.allergens,
              storage: it.storage,
              countryOfOrigin: "India",
            },
            artKey: it.art,
            isFeatured: it.featured ?? false,
            status: "ACTIVE",
          })
          .returning({ id: items.id });
        itemCount++;
        await tx.insert(itemVariants).values(
          it.variants.map((vr, i) => ({
            itemId: item!.id,
            sku: `${it.slug}-${i + 1}`,
            label: vr.label,
            pricePaise: vr.rupees * 100,
            mrpPaise: vr.mrpRupees ? vr.mrpRupees * 100 : null,
            netWeightG: vr.netG,
            packedWeightG: vr.packedG,
            defaultDailyCap: vr.cap,
            sortOrder: i,
          })),
        );
        variantCount += it.variants.length;
      }
    }

    // People ------------------------------------------------------------------------------------
    if (options.withDevUsers ?? true) {
      await tx.insert(profiles).values([DEV_CUSTOMER, DEV_OPS]);
      await tx.insert(memberships).values([
        { userId: DEV_OPS.id, role: "OPS" },
        { userId: DEV_OPS.id, role: "ADMIN" },
      ]);
      for (const [i, v] of vendorIds.entries()) {
        const owner = devVendorOwner(i, v.slug);
        await tx.insert(profiles).values(owner);
        await tx
          .insert(memberships)
          .values({ userId: owner.id, role: "VENDOR_OWNER", vendorId: v.id });
      }
    }

    const slots = await materializeInventorySlots(tx, {
      from: istDateOf(options.today),
      days: options.slotDays ?? 30,
    });

    await tx.execute(sql`analyze`);
    return {
      cities: cityRows.length,
      pincodes: pincodeRows.length,
      vendors: vendorIds.length,
      items: itemCount,
      variants: variantCount,
      lanes: laneRows.length,
      slots,
    };
  });
}
