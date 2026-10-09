/**
 * Bringing kitchens, delicacies, routes and cities onto the platform from the ops console. Every
 * change is data, never a deploy: a kitchen starts in ONBOARDING, collects what it needs, and
 * goes live only when its readiness checks pass.
 */
import { type Executor, materializeInventorySlots, pgError, schema } from "@food-del/db";
import {
  ART_KEYS,
  assessKitchenReadiness,
  GST_RATES_BPS,
  isReadyToGoLive,
  istDateOf,
  normaliseIndianMobile,
  parsePincodeRanges,
  planShipment,
  REASON_MESSAGES,
  type ReadinessCheck,
  type ShipmentLine,
  slugify,
} from "@food-del/domain";
import type {
  AddKitchenMemberRequest,
  CreateCityRequest,
  CreateKitchenRequest,
  DirectoryDistrict,
  ItemAdminDetail,
  ItemAdminSummary,
  ItemInput,
  KitchenDetail,
  OnboardingOptions,
  ReachPreview,
  ReachPreviewRequest,
  Route,
  RouteInput,
  SetItemStatusRequest,
  UpdateKitchenRequest,
} from "@food-del/domain/contracts";
import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { CoreDeps } from "../deps";
import { conflict, invalid, notFound } from "../errors";
import { iso } from "../mappers";
import { invalidateReference, loadReference, PlanningLoader } from "../planning";
import { requireStaff, type Viewer } from "../viewer";

const {
  categories,
  cities,
  itemVariants,
  items,
  memberships,
  pincodes,
  profiles,
  rateCards,
  vendors,
} = schema;

/** Inventory is opened this many days ahead when something goes on sale. */
const SLOT_DAYS = 30;

const hhmm = (t: string) => t.slice(0, 5);

/** Find or invite a person by phone; an invited profile is claimed at their first sign-in. */
async function profileForInvite(tx: Executor, name: string, phoneRaw: string): Promise<string> {
  const phone = normaliseIndianMobile(phoneRaw);
  if (!phone) throw invalid("INVALID_PHONE", "Enter a 10-digit Indian mobile number.");
  const [row] = await tx
    .insert(profiles)
    .values({ phone, fullName: name })
    .onConflictDoUpdate({
      target: profiles.phone,
      set: { fullName: sql`coalesce(${profiles.fullName}, excluded.full_name)` },
    })
    .returning({ id: profiles.id });
  return row!.id;
}

/** Facts behind a kitchen's readiness checklist, gathered in one round trip. */
export async function kitchenReadiness(
  db: Executor,
  vendorId: string,
  today: string,
): Promise<ReadinessCheck[]> {
  const [row] = await db
    .select({
      v: vendors,
      cityIsOrigin: cities.isOrigin,
      owners: sql<number>`(select count(*)::int from memberships m where m.vendor_id = "vendors"."id" and m.role = 'VENDOR_OWNER')`,
      sellable: sql<number>`(select count(*)::int from items i where i.vendor_id = "vendors"."id" and i.status = 'ACTIVE' and exists (select 1 from item_variants iv where iv.item_id = i.id and iv.is_active))`,
      routes: sql<number>`(select count(distinct p.city_id)::int from serviceability_matrix sm join pincodes p on p.pincode = sm.dest_pincode where sm.origin_city_id = "vendors"."city_id" and sm.is_active)`,
    })
    .from(vendors)
    .innerJoin(cities, eq(cities.id, vendors.cityId))
    .where(eq(vendors.id, vendorId));
  if (!row) throw notFound("Kitchen");
  return assessKitchenReadiness({
    fssaiValidUntil: row.v.fssaiValidUntil,
    today,
    owners: row.owners,
    sellableItems: row.sellable,
    cityIsOrigin: row.cityIsOrigin,
    routesFromCity: row.routes,
    dispatchWeekdays: row.v.dispatchWeekdays,
    payoutAccountLinked: Boolean(row.v.payoutAccountRef),
  });
}

/** Refuse to put a kitchen live while a blocking readiness check fails. */
export async function assertKitchenReady(db: Executor, vendorId: string, today: string) {
  const checks = await kitchenReadiness(db, vendorId, today);
  if (!isReadyToGoLive(checks)) {
    const missing = checks.filter((c) => !c.ok && c.blocking);
    throw conflict(
      "KITCHEN_NOT_READY",
      `Not ready to go live: ${missing.map((c) => c.label.toLowerCase()).join("; ")}.`,
      missing,
    );
  }
}

/** A unique violation on a constraint whose name mentions `column` (e.g. vendors_slug_unique). */
function uniqueViolation(e: unknown, column: string): boolean {
  const pg = pgError(e);
  return pg?.code === "23505" && (pg.constraint_name ?? "").includes(column);
}

export class OnboardingService {
  constructor(private readonly deps: CoreDeps) {}

  private get db() {
    return this.deps.db;
  }

  private today(): string {
    return istDateOf(this.deps.clock());
  }

  async options(viewer: Viewer | null): Promise<OnboardingOptions> {
    requireStaff(viewer);
    const [cityRows, categoryRows, rateRows] = await Promise.all([
      this.db
        .select({
          c: cities,
          pincodes: sql<number>`(select count(*)::int from pincodes p where p.city_id = "cities"."id")`,
        })
        .from(cities)
        .orderBy(asc(cities.sortOrder), asc(cities.name)),
      this.db.select().from(categories).orderBy(asc(categories.sortOrder)),
      this.db.select().from(rateCards).orderBy(asc(rateCards.carrierCode), asc(rateCards.zone)),
    ]);
    const carriers = new Map<string, Map<string, string[]>>();
    for (const r of rateRows) {
      const modes = carriers.get(r.carrierCode) ?? new Map<string, string[]>();
      modes.set(r.mode, [...(modes.get(r.mode) ?? []), r.zone]);
      carriers.set(r.carrierCode, modes);
    }
    return {
      cities: cityRows.map((r) => ({
        id: r.c.id,
        slug: r.c.slug,
        name: r.c.name,
        stateCode: r.c.stateCode,
        isOrigin: r.c.isOrigin,
        isDestination: r.c.isDestination,
        launchStatus: r.c.launchStatus,
        pincodes: r.pincodes,
      })),
      categories: categoryRows.map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
      carriers: [...carriers].map(([code, modes]) => ({
        code,
        modes: [...modes].map(([mode, zones]) => ({
          mode: mode as "AIR_EXPRESS" | "SURFACE_EXPRESS",
          zones,
        })),
      })),
      artKeys: [...ART_KEYS],
      gstRatesBps: [...GST_RATES_BPS],
    };
  }

  // ─── Kitchens ───────────────────────────────────────────────────────────────────────────────

  private async assertPickupInCity(pincode: string, cityId: string) {
    const [p] = await this.db
      .select({ cityId: pincodes.cityId, cityName: cities.name })
      .from(pincodes)
      .leftJoin(cities, eq(cities.id, pincodes.cityId))
      .where(eq(pincodes.pincode, pincode));
    if (!p) throw invalid("UNKNOWN_PINCODE", `${pincode} isn't in the pincode directory.`);
    if (p.cityId !== cityId) {
      throw invalid(
        "PICKUP_OUTSIDE_CITY",
        `Pickup pincode ${pincode} is ${p.cityName ? `in ${p.cityName}` : "outside our cities"}, not the kitchen's city.`,
      );
    }
  }

  async createKitchen(viewer: Viewer | null, input: CreateKitchenRequest): Promise<KitchenDetail> {
    requireStaff(viewer);
    const [city] = await this.db.select().from(cities).where(eq(cities.id, input.cityId));
    if (!city) throw notFound("City");
    await this.assertPickupInCity(input.pickupPincode, city.id);
    const slug = input.slug ?? slugify(input.name);
    if (!slug) throw invalid("INVALID_SLUG", "Give the kitchen a name with letters or numbers.");
    const phone = normaliseIndianMobile(input.pickupAddress.contactPhone)!;
    try {
      const id = await this.db.transaction(async (tx) => {
        const [vendor] = await tx
          .insert(vendors)
          .values({
            cityId: city.id,
            slug,
            name: input.name,
            tagline: input.tagline ?? null,
            story: input.story ?? null,
            establishedYear: input.establishedYear ?? null,
            pickupPincode: input.pickupPincode,
            pickupAddress: { ...input.pickupAddress, contactPhone: phone },
            fssaiLicenseNo: input.fssaiLicenseNo,
            fssaiValidUntil: input.fssaiValidUntil,
            gstin: input.gstin ?? null,
            orderCutoffLocal: input.orderCutoffLocal,
            prepLeadDays: input.prepLeadDays,
            prepStartLocal: input.prepStartLocal,
            readyForPickupLocal: input.readyForPickupLocal,
            dispatchWeekdays: input.dispatchWeekdays,
            dailyShipmentCap: input.dailyShipmentCap,
            commissionBps: input.commissionBps,
            payoutAccountRef: input.payoutAccountRef ?? null,
            status: "ONBOARDING",
          })
          .returning({ id: vendors.id });
        const ownerId = await profileForInvite(tx, input.owner.name, input.owner.phone);
        await tx
          .insert(memberships)
          .values({ userId: ownerId, role: "VENDOR_OWNER", vendorId: vendor!.id })
          .onConflictDoNothing();
        return vendor!.id;
      });
      this.deps.logger.info("kitchen created", { vendorId: id, slug });
      return this.kitchen(viewer, id);
    } catch (e) {
      if (uniqueViolation(e, "slug")) {
        throw conflict("SLUG_TAKEN", `Another kitchen already uses the address /kitchens/${slug}.`);
      }
      throw e;
    }
  }

  async kitchen(viewer: Viewer | null, id: string): Promise<KitchenDetail> {
    requireStaff(viewer);
    const [row] = await this.db
      .select({ v: vendors, c: cities })
      .from(vendors)
      .innerJoin(cities, eq(cities.id, vendors.cityId))
      .where(eq(vendors.id, id));
    if (!row) throw notFound("Kitchen");
    const [memberRows, itemRows, readiness] = await Promise.all([
      this.db
        .select({ m: memberships, p: profiles })
        .from(memberships)
        .innerJoin(profiles, eq(profiles.id, memberships.userId))
        .where(eq(memberships.vendorId, id))
        .orderBy(asc(memberships.createdAt)),
      this.itemSummaries(id),
      kitchenReadiness(this.db, id, this.today()),
    ]);
    const v = row.v;
    return {
      id: v.id,
      slug: v.slug,
      status: v.status,
      city: { id: row.c.id, slug: row.c.slug, name: row.c.name },
      name: v.name,
      tagline: v.tagline,
      story: v.story,
      establishedYear: v.establishedYear,
      pickupPincode: v.pickupPincode,
      pickupAddress: v.pickupAddress,
      fssaiLicenseNo: v.fssaiLicenseNo,
      fssaiValidUntil: v.fssaiValidUntil,
      gstin: v.gstin,
      orderCutoffLocal: hhmm(v.orderCutoffLocal),
      prepLeadDays: v.prepLeadDays,
      prepStartLocal: hhmm(v.prepStartLocal),
      readyForPickupLocal: hhmm(v.readyForPickupLocal),
      dispatchWeekdays: v.dispatchWeekdays,
      dailyShipmentCap: v.dailyShipmentCap,
      commissionBps: v.commissionBps,
      payoutAccountRef: v.payoutAccountRef,
      members: memberRows
        .filter((r) => r.m.role === "VENDOR_OWNER" || r.m.role === "VENDOR_STAFF")
        .map((r) => ({
          userId: r.p.id,
          name: r.p.fullName,
          phone: r.p.phone,
          role: r.m.role as "VENDOR_OWNER" | "VENDOR_STAFF",
        })),
      items: itemRows,
      readiness,
      readyToGoLive: isReadyToGoLive(readiness),
      createdAt: iso(v.createdAt),
    };
  }

  async updateKitchen(
    viewer: Viewer | null,
    id: string,
    patch: UpdateKitchenRequest,
  ): Promise<KitchenDetail> {
    requireStaff(viewer);
    const [current] = await this.db.select().from(vendors).where(eq(vendors.id, id));
    if (!current) throw notFound("Kitchen");
    if (patch.pickupPincode && patch.pickupPincode !== current.pickupPincode) {
      await this.assertPickupInCity(patch.pickupPincode, current.cityId);
    }
    const set: Partial<typeof vendors.$inferInsert> = { ...patch };
    if (patch.pickupAddress) {
      set.pickupAddress = {
        ...patch.pickupAddress,
        contactPhone: normaliseIndianMobile(patch.pickupAddress.contactPhone)!,
      };
    }
    if (Object.keys(set).length > 0) {
      await this.db.update(vendors).set(set).where(eq(vendors.id, id));
    }
    // A live kitchen that becomes unready (e.g. licence lapses) stays live; ops sees the checklist.
    return this.kitchen(viewer, id);
  }

  async addMember(
    viewer: Viewer | null,
    vendorId: string,
    input: AddKitchenMemberRequest,
  ): Promise<KitchenDetail> {
    requireStaff(viewer);
    const [v] = await this.db
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.id, vendorId));
    if (!v) throw notFound("Kitchen");
    await this.db.transaction(async (tx) => {
      const userId = await profileForInvite(tx, input.name, input.phone);
      await tx
        .insert(memberships)
        .values({ userId, role: input.role, vendorId })
        .onConflictDoNothing();
    });
    return this.kitchen(viewer, vendorId);
  }

  // ─── Delicacies ─────────────────────────────────────────────────────────────────────────────

  private async itemSummaries(vendorId: string): Promise<ItemAdminSummary[]> {
    const rows = await this.db
      .select({
        i: items,
        category: categories.name,
        variants: sql<number>`(select count(*)::int from item_variants iv where iv.item_id = "items"."id" and iv.is_active)`,
        fromPrice: sql<
          number | null
        >`(select min(iv.price_paise)::int from item_variants iv where iv.item_id = "items"."id" and iv.is_active)`,
      })
      .from(items)
      .innerJoin(categories, eq(categories.id, items.categoryId))
      .where(eq(items.vendorId, vendorId))
      .orderBy(asc(items.name));
    return rows.map((r) => ({
      id: r.i.id,
      slug: r.i.slug,
      name: r.i.name,
      category: r.category,
      tempClass: r.i.tempClass,
      shelfLifeHours: r.i.shelfLifeHours,
      status: r.i.status,
      variants: r.variants,
      fromPricePaise: r.fromPrice,
      artKey: r.i.artKey,
    }));
  }

  async item(viewer: Viewer | null, id: string): Promise<ItemAdminDetail> {
    requireStaff(viewer);
    const [i] = await this.db.select().from(items).where(eq(items.id, id));
    if (!i) throw notFound("Delicacy");
    const variants = await this.db
      .select()
      .from(itemVariants)
      .where(eq(itemVariants.itemId, id))
      .orderBy(desc(itemVariants.isActive), asc(itemVariants.sortOrder));
    return {
      id: i.id,
      vendorId: i.vendorId,
      slug: i.slug,
      status: i.status,
      categoryId: i.categoryId,
      name: i.name,
      shortDescription: i.shortDescription,
      description: i.description,
      originStory: i.originStory,
      diet: i.diet,
      tempClass: i.tempClass,
      shelfLifeHours: i.shelfLifeHours,
      minResidualHours: i.minResidualHours,
      madeToOrder: i.madeToOrder,
      maxAgeAtDispatchHours: i.maxAgeAtDispatchHours,
      hsnCode: i.hsnCode,
      gstRateBps: i.gstRateBps,
      ingredients: i.legal.ingredients,
      allergens: i.legal.allergens,
      storage: i.legal.storage,
      artKey: (ART_KEYS as readonly string[]).includes(i.artKey ?? "")
        ? (i.artKey as ItemAdminDetail["artKey"])
        : null,
      isFeatured: i.isFeatured,
      variants: variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        label: v.label,
        pricePaise: v.pricePaise,
        mrpPaise: v.mrpPaise,
        netWeightG: v.netWeightG,
        packedWeightG: v.packedWeightG,
        defaultDailyCap: v.defaultDailyCap,
        isActive: v.isActive,
      })),
    };
  }

  private itemFields(input: ItemInput, manufacturer: string) {
    return {
      categoryId: input.categoryId,
      name: input.name,
      shortDescription: input.shortDescription,
      description: input.description ?? null,
      originStory: input.originStory ?? null,
      diet: input.diet,
      tempClass: input.tempClass,
      shelfLifeHours: input.shelfLifeHours,
      minResidualHours: input.minResidualHours,
      madeToOrder: input.madeToOrder,
      maxAgeAtDispatchHours: input.madeToOrder ? null : (input.maxAgeAtDispatchHours ?? null),
      hsnCode: input.hsnCode,
      gstRateBps: input.gstRateBps,
      legal: {
        manufacturer,
        ingredients: input.ingredients,
        allergens: input.allergens,
        storage: input.storage,
        countryOfOrigin: "India" as const,
      },
      artKey: input.artKey ?? null,
      isFeatured: input.isFeatured ?? false,
    };
  }

  private async assertCategory(categoryId: string) {
    const [c] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, categoryId));
    if (!c) throw invalid("UNKNOWN_CATEGORY", "Pick a category.");
  }

  async createItem(
    viewer: Viewer | null,
    vendorId: string,
    input: ItemInput,
  ): Promise<ItemAdminDetail> {
    requireStaff(viewer);
    const [v] = await this.db
      .select({ name: vendors.name, city: cities.name })
      .from(vendors)
      .innerJoin(cities, eq(cities.id, vendors.cityId))
      .where(eq(vendors.id, vendorId));
    if (!v) throw notFound("Kitchen");
    await this.assertCategory(input.categoryId);
    const slug = input.slug ?? slugify(input.name);
    if (!slug) throw invalid("INVALID_SLUG", "Give the delicacy a name with letters or numbers.");
    try {
      const id = await this.db.transaction(async (tx) => {
        const [item] = await tx
          .insert(items)
          .values({
            vendorId,
            slug,
            status: "DRAFT",
            ...this.itemFields(input, `${v.name}, ${v.city}`),
          })
          .returning({ id: items.id });
        await tx.insert(itemVariants).values(
          input.variants.map((vr, i) => ({
            itemId: item!.id,
            sku: `${slug}-${i + 1}`,
            label: vr.label,
            pricePaise: vr.pricePaise,
            mrpPaise: vr.mrpPaise ?? null,
            netWeightG: vr.netWeightG,
            packedWeightG: vr.packedWeightG,
            defaultDailyCap: vr.defaultDailyCap,
            isActive: vr.isActive ?? true,
            sortOrder: i,
          })),
        );
        return item!.id;
      });
      return this.item(viewer, id);
    } catch (e) {
      if (uniqueViolation(e, "slug") || uniqueViolation(e, "sku")) {
        throw conflict(
          "SLUG_TAKEN",
          `Another delicacy already uses the address /delicacy/${slug}.`,
        );
      }
      throw e;
    }
  }

  /** Edit a delicacy. Its address (slug) never changes; pack sizes left out are retired, not deleted. */
  async updateItem(viewer: Viewer | null, id: string, input: ItemInput): Promise<ItemAdminDetail> {
    requireStaff(viewer);
    const [current] = await this.db
      .select({ i: items, vendorName: vendors.name, city: cities.name })
      .from(items)
      .innerJoin(vendors, eq(vendors.id, items.vendorId))
      .innerJoin(cities, eq(cities.id, vendors.cityId))
      .where(eq(items.id, id));
    if (!current) throw notFound("Delicacy");
    await this.assertCategory(input.categoryId);
    await this.db.transaction(async (tx) => {
      await tx
        .update(items)
        .set(this.itemFields(input, current.i.legal.manufacturer))
        .where(eq(items.id, id));
      const existing = await tx.select().from(itemVariants).where(eq(itemVariants.itemId, id));
      const known = new Set(existing.map((v) => v.id));
      const kept = new Set<string>();
      let next = existing.length;
      for (const [i, vr] of input.variants.entries()) {
        const fields = {
          label: vr.label,
          pricePaise: vr.pricePaise,
          mrpPaise: vr.mrpPaise ?? null,
          netWeightG: vr.netWeightG,
          packedWeightG: vr.packedWeightG,
          defaultDailyCap: vr.defaultDailyCap,
          isActive: vr.isActive ?? true,
          sortOrder: i,
        };
        if (vr.id) {
          if (!known.has(vr.id))
            throw invalid("UNKNOWN_VARIANT", "That pack size isn't on this delicacy.");
          kept.add(vr.id);
          await tx.update(itemVariants).set(fields).where(eq(itemVariants.id, vr.id));
        } else {
          next += 1;
          await tx
            .insert(itemVariants)
            .values({ itemId: id, sku: `${current.i.slug}-${next}`, ...fields });
        }
      }
      const retired = existing.filter((v) => !kept.has(v.id)).map((v) => v.id);
      if (retired.length > 0) {
        await tx
          .update(itemVariants)
          .set({ isActive: false })
          .where(inArray(itemVariants.id, retired));
      }
    });
    if (current.i.status === "ACTIVE") {
      await materializeInventorySlots(this.db, { days: SLOT_DAYS, now: this.deps.clock() });
    }
    return this.item(viewer, id);
  }

  async setItemStatus(
    viewer: Viewer | null,
    id: string,
    { status }: SetItemStatusRequest,
  ): Promise<ItemAdminDetail> {
    requireStaff(viewer);
    if (status === "ACTIVE") {
      const [{ n } = { n: 0 }] = await this.db
        .select({ n: count() })
        .from(itemVariants)
        .where(and(eq(itemVariants.itemId, id), eq(itemVariants.isActive, true)));
      if (n === 0) {
        throw conflict("NO_ACTIVE_PACK", "Add at least one pack size before putting this on sale.");
      }
    }
    const updated = await this.db
      .update(items)
      .set({ status })
      .where(eq(items.id, id))
      .returning({ id: items.id });
    if (updated.length === 0) throw notFound("Delicacy");
    if (status === "ACTIVE") {
      await materializeInventorySlots(this.db, { days: SLOT_DAYS, now: this.deps.clock() });
    }
    return this.item(viewer, id);
  }

  /**
   * Where a delicacy, as drafted, could reach in time from this kitchen: the real planner run
   * once per destination city, so ops sees "would spoil" before anything goes on sale.
   */
  async reachPreview(
    viewer: Viewer | null,
    vendorId: string,
    draft: ReachPreviewRequest,
  ): Promise<ReachPreview> {
    requireStaff(viewer);
    const loader = new PlanningLoader(this.db, this.deps);
    const vendor = await loader.vendor(vendorId).catch(() => {
      throw notFound("Kitchen");
    });
    const [destinations, samples, reference] = await Promise.all([
      this.db
        .select({ id: cities.id, slug: cities.slug, name: cities.name })
        .from(cities)
        .where(and(eq(cities.isDestination, true), ne(cities.id, vendor.cityId)))
        .orderBy(asc(cities.sortOrder), asc(cities.name)),
      // One ordinary (non-ODA) pincode per destination city that this origin already serves.
      this.db.execute<{ city_id: string; pincode: string }>(sql`
        select distinct on (p.city_id) p.city_id, sm.dest_pincode as pincode
        from serviceability_matrix sm
        join pincodes p on p.pincode = sm.dest_pincode
        where sm.origin_city_id = ${vendor.cityId} and sm.is_active and not p.is_oda
        order by p.city_id, sm.dest_pincode
      `),
      loadReference(this.db, this.deps.clock().getTime()),
    ]);
    const sampleByCity = new Map([...samples].map((r) => [r.city_id, r.pincode]));
    const line: ShipmentLine = {
      variantId: "preview",
      quantity: 1,
      unitPricePaise: draft.pricePaise,
      gstRateBps: draft.gstRateBps,
      unitPackedWeightG: draft.packedWeightG,
      freshness: {
        tempClass: draft.tempClass,
        shelfLifeHours: draft.shelfLifeHours,
        minResidualHours: draft.minResidualHours,
        madeToOrder: draft.madeToOrder,
        maxAgeAtDispatchHours: draft.madeToOrder ? null : (draft.maxAgeAtDispatchHours ?? null),
      },
    };
    const results = await Promise.all(
      destinations.map(async (city) => {
        const ref = { slug: city.slug, name: city.name };
        const none = {
          city: ref,
          mode: null,
          carrierCode: null,
          packaging: null,
          dispatchDate: null,
          deliveryDate: null,
          shippingPaise: null,
        };
        const pincode = sampleByCity.get(city.id);
        const dest = pincode ? await loader.destination(pincode) : null;
        if (!dest) {
          return { ...none, ok: false, reason: "NO_LANE" as const, message: "No route yet." };
        }
        const ctx = await loader.context(vendorId, dest, [line], () => 1_000);
        const result = planShipment(ctx, { kind: "EARLIEST" });
        if (!result.ok) {
          return {
            ...none,
            ok: false,
            reason: result.reason,
            message: REASON_MESSAGES[result.reason],
          };
        }
        const p = result.plan;
        return {
          city: ref,
          ok: true,
          mode: p.mode,
          carrierCode: p.carrierCode,
          packaging: reference.packagingNames.get(p.packagingCode)?.name ?? p.packagingCode,
          dispatchDate: p.dispatchDate,
          deliveryDate: p.promisedDeliveryDate,
          shippingPaise: p.shippingFeePaise + p.packagingFeePaise,
          reason: null,
          message: null,
        };
      }),
    );
    return { origin: { slug: vendor.citySlug, name: vendor.cityName }, destinations: results };
  }

  // ─── Routes ─────────────────────────────────────────────────────────────────────────────────

  async routes(
    viewer: Viewer | null,
    filter: { originCityId?: string; destinationCityId?: string } = {},
  ): Promise<Route[]> {
    requireStaff(viewer);
    const rows = await this.db.execute<{
      origin_id: string;
      origin_slug: string;
      origin_name: string;
      dest_id: string;
      dest_slug: string;
      dest_name: string;
      carrier_code: string;
      mode: "AIR_EXPRESS" | "SURFACE_EXPRESS";
      p50: number;
      p90: number;
      cutoff: string;
      sunday: boolean;
      dry_ice: boolean;
      zone: string;
      pincodes: number;
      active: number;
      dest_pincodes: number;
      uniform: boolean;
      source: "CARRIER_FEED" | "MANUAL" | "OBSERVED";
      refreshed_at: string;
    }>(sql`
      select o.id as origin_id, o.slug as origin_slug, o.name as origin_name,
             d.id as dest_id, d.slug as dest_slug, d.name as dest_name,
             sm.carrier_code, sm.mode,
             max(sm.transit_hours_p50)::int as p50,
             max(sm.transit_hours_p90)::int as p90,
             min(sm.pickup_cutoff_local)::text as cutoff,
             bool_and(sm.delivers_sunday) as sunday,
             bool_and(sm.accepts_dry_ice) as dry_ice,
             min(sm.rate_zone) as zone,
             count(*)::int as pincodes,
             (count(*) filter (where sm.is_active))::int as active,
             (select count(*)::int from pincodes dp where dp.city_id = d.id) as dest_pincodes,
             count(distinct (sm.transit_hours_p50, sm.transit_hours_p90, sm.pickup_cutoff_local,
                             sm.delivers_sunday, sm.accepts_dry_ice, sm.rate_zone)) = 1 as uniform,
             mode() within group (order by sm.source) as source,
             to_char(max(sm.refreshed_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as refreshed_at
      from serviceability_matrix sm
      join pincodes p on p.pincode = sm.dest_pincode
      join cities o on o.id = sm.origin_city_id
      join cities d on d.id = p.city_id
      where (${filter.originCityId ?? null}::uuid is null or sm.origin_city_id = ${filter.originCityId ?? null}::uuid)
        and (${filter.destinationCityId ?? null}::uuid is null or d.id = ${filter.destinationCityId ?? null}::uuid)
      group by o.id, o.slug, o.name, o.sort_order, d.id, d.slug, d.name, d.sort_order, sm.carrier_code, sm.mode
      order by o.sort_order, d.sort_order, sm.mode, sm.carrier_code
    `);
    return [...rows].map((r) => ({
      originCityId: r.origin_id,
      destinationCityId: r.dest_id,
      origin: { slug: r.origin_slug, name: r.origin_name },
      destination: { slug: r.dest_slug, name: r.dest_name },
      carrierCode: r.carrier_code,
      mode: r.mode,
      transitHoursP50: r.p50,
      transitHoursP90: r.p90,
      pickupCutoffLocal: hhmm(r.cutoff),
      deliversSunday: r.sunday,
      acceptsDryIce: r.dry_ice,
      rateZone: r.zone,
      isActive: r.active > 0,
      pincodes: r.pincodes,
      activePincodes: r.active,
      destinationPincodes: r.dest_pincodes,
      uniform: r.uniform,
      source: r.source,
      refreshedAt: r.refreshed_at,
    }));
  }

  /**
   * Create or update a route: one courier service from a city to every pincode of another. Saving
   * again also covers pincodes added to the destination since.
   */
  async upsertRoute(viewer: Viewer | null, input: RouteInput): Promise<Route> {
    requireStaff(viewer);
    const found = await this.db
      .select()
      .from(cities)
      .where(inArray(cities.id, [input.originCityId, input.destinationCityId]));
    const origin = found.find((c) => c.id === input.originCityId);
    const dest = found.find((c) => c.id === input.destinationCityId);
    if (!origin || !dest) throw notFound("City");
    if (!origin.isOrigin) {
      throw invalid(
        "ORIGIN_NOT_ENABLED",
        `${origin.name} isn't set up to ship out. Mark it as an origin city first.`,
      );
    }
    if (!dest.isDestination) {
      throw invalid(
        "DESTINATION_NOT_ENABLED",
        `${dest.name} isn't set up to receive. Mark it as a destination first.`,
      );
    }
    const [rate] = await this.db
      .select({ id: rateCards.id })
      .from(rateCards)
      .where(
        and(
          eq(rateCards.carrierCode, input.carrierCode),
          eq(rateCards.mode, input.mode),
          eq(rateCards.zone, input.rateZone),
        ),
      );
    if (!rate) {
      throw invalid(
        "RATE_CARD_MISSING",
        `There's no ${input.carrierCode} rate card for that service and zone, so parcels couldn't be priced.`,
      );
    }
    const now = this.deps.clock().toISOString();
    const written = await this.db.execute(sql`
      insert into serviceability_matrix (
        origin_city_id, dest_pincode, carrier_code, mode, transit_hours_p50, transit_hours_p90,
        pickup_cutoff_local, delivers_sunday, accepts_dry_ice, rate_zone, source, is_active, refreshed_at
      )
      select ${origin.id}::uuid, p.pincode, ${input.carrierCode}, ${input.mode}::ship_mode,
             ${input.transitHoursP50}, ${input.transitHoursP90}, ${input.pickupCutoffLocal}::time,
             ${input.deliversSunday}, ${input.acceptsDryIce}, ${input.rateZone},
             'MANUAL'::lane_source, ${input.isActive}, ${now}::timestamptz
      from pincodes p
      where p.city_id = ${dest.id}::uuid
      on conflict (origin_city_id, dest_pincode, carrier_code, mode) do update set
        transit_hours_p50 = excluded.transit_hours_p50,
        transit_hours_p90 = excluded.transit_hours_p90,
        pickup_cutoff_local = excluded.pickup_cutoff_local,
        delivers_sunday = excluded.delivers_sunday,
        accepts_dry_ice = excluded.accepts_dry_ice,
        rate_zone = excluded.rate_zone,
        source = excluded.source,
        is_active = excluded.is_active,
        refreshed_at = excluded.refreshed_at
      returning 1
    `);
    if (written.length === 0) {
      throw invalid(
        "NO_PINCODES",
        `${dest.name} has no pincodes yet, so there's nothing to deliver to.`,
      );
    }
    this.deps.logger.info("route saved", {
      origin: origin.slug,
      destination: dest.slug,
      carrier: input.carrierCode,
      mode: input.mode,
      pincodes: written.length,
    });
    const [route] = (
      await this.routes(viewer, {
        originCityId: origin.id,
        destinationCityId: dest.id,
      })
    ).filter((r) => r.carrierCode === input.carrierCode && r.mode === input.mode);
    return route!;
  }

  // ─── Cities ─────────────────────────────────────────────────────────────────────────────────

  /** Districts in the pincode directory that no city has claimed yet. */
  async directoryDistricts(
    viewer: Viewer | null,
    stateCode?: string,
  ): Promise<DirectoryDistrict[]> {
    requireStaff(viewer);
    const rows = await this.db
      .select({
        district: pincodes.district,
        stateCode: pincodes.stateCode,
        pincodes: sql<number>`count(*)::int`,
      })
      .from(pincodes)
      .where(
        and(isNull(pincodes.cityId), stateCode ? eq(pincodes.stateCode, stateCode) : undefined),
      )
      .groupBy(pincodes.district, pincodes.stateCode)
      .orderBy(asc(pincodes.stateCode), asc(pincodes.district));
    return rows;
  }

  /** A new city starts hidden; it claims unassigned directory pincodes by district or range. */
  async createCity(viewer: Viewer | null, input: CreateCityRequest): Promise<string> {
    requireStaff(viewer);
    const slug = input.slug ?? slugify(input.name);
    if (!slug) throw invalid("INVALID_SLUG", "Give the city a name with letters.");
    const ranges = input.pincodeRanges ? parsePincodeRanges(input.pincodeRanges) : [];
    if (ranges === null) {
      throw invalid("INVALID_PINCODES", "Use pincodes or ranges like 302001-302039, 303007.");
    }
    if (input.districts.length === 0 && ranges.length === 0) {
      throw invalid("NO_PINCODES", "Choose at least one district or pincode range.");
    }
    try {
      return await this.db.transaction(async (tx) => {
        const [{ sortOrder } = { sortOrder: 0 }] = await tx
          .select({ sortOrder: sql<number>`coalesce(max(${cities.sortOrder}), 0)::int + 1` })
          .from(cities);
        const [city] = await tx
          .insert(cities)
          .values({
            slug,
            name: input.name,
            stateCode: input.stateCode,
            airportIata: input.airportIata ?? null,
            tagline: input.tagline ?? null,
            isOrigin: input.isOrigin,
            isDestination: input.isDestination,
            launchStatus: "HIDDEN",
            sortOrder,
          })
          .returning({ id: cities.id });
        const claims = [
          ...(input.districts.length
            ? [
                and(
                  inArray(
                    sql`upper(${pincodes.district})`,
                    input.districts.map((d) => d.toUpperCase()),
                  ),
                  eq(pincodes.stateCode, input.stateCode),
                ),
              ]
            : []),
          ...ranges.map((r) => sql`${pincodes.pincode}::int between ${r.from} and ${r.to}`),
        ];
        const claimed = await tx
          .update(pincodes)
          .set({ cityId: city!.id })
          .where(and(isNull(pincodes.cityId), or(...claims)))
          .returning({ pincode: pincodes.pincode });
        if (claimed.length === 0) {
          throw invalid(
            "NO_PINCODES",
            "None of those pincodes are in the directory, or other cities already have them.",
          );
        }
        invalidateReference();
        this.deps.logger.info("city created", { slug, pincodes: claimed.length });
        return city!.id;
      });
    } catch (e) {
      if (uniqueViolation(e, "slug")) {
        throw conflict("SLUG_TAKEN", `A city called ${input.name} already exists.`);
      }
      throw e;
    }
  }
}
