import { type Executor, schema } from "@food-del/db";
import {
  freshnessLabel,
  planShipment,
  REASON_MESSAGES,
  type ReasonCode,
  type ShipmentLine,
} from "@food-del/domain";
import type {
  Category,
  City,
  DeliverySummary,
  ItemCard,
  ItemDetail,
  ItemListQuery,
  VendorDetail,
} from "@food-del/domain/contracts";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { CoreDeps } from "../deps";
import { notFound } from "../errors";
import { iso, vendorSummary } from "../mappers";
import { destinationProblem, PlanningLoader } from "../planning";

const { categories, cities, items, itemVariants, vendors } = schema;

type ItemRow = typeof items.$inferSelect;
type VariantRow = typeof itemVariants.$inferSelect;

interface ItemWithRelations {
  item: ItemRow;
  vendor: typeof vendors.$inferSelect;
  city: typeof cities.$inferSelect;
  category: typeof categories.$inferSelect;
  variants: VariantRow[];
}

function unavailable(reason: ReasonCode): DeliverySummary {
  return { available: false, reason, message: REASON_MESSAGES[reason] };
}

export function shipmentLineFor(
  item: ItemRow,
  variant: VariantRow,
  quantity: number,
): ShipmentLine {
  return {
    variantId: variant.id,
    quantity,
    unitPricePaise: variant.pricePaise,
    gstRateBps: item.gstRateBps,
    unitPackedWeightG: variant.packedWeightG,
    freshness: {
      tempClass: item.tempClass,
      shelfLifeHours: item.shelfLifeHours,
      minResidualHours: item.minResidualHours,
      madeToOrder: item.madeToOrder,
      maxAgeAtDispatchHours: item.maxAgeAtDispatchHours,
    },
  };
}

export class CatalogService {
  constructor(private readonly deps: CoreDeps) {}

  private get db(): Executor {
    return this.deps.db;
  }

  async listCities(): Promise<City[]> {
    const rows = await this.db
      .select({
        c: cities,
        itemCount: sql<number>`(
          select count(*)::int from items i join vendors v on v.id = i.vendor_id
          where v.city_id = "cities"."id" and i.status = 'ACTIVE' and v.status = 'ACTIVE'
        )`,
      })
      .from(cities)
      .where(inArray(cities.launchStatus, ["LIVE", "COMING_SOON"]))
      .orderBy(asc(cities.sortOrder), asc(cities.name));
    return rows.map(({ c, itemCount }) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      stateCode: c.stateCode,
      isOrigin: c.isOrigin,
      isDestination: c.isDestination,
      launchStatus: c.launchStatus,
      tagline: c.tagline,
      itemCount,
    }));
  }

  async listCategories(): Promise<Category[]> {
    const rows = await this.db.select().from(categories).orderBy(asc(categories.sortOrder));
    return rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description }));
  }

  private async loadItems(
    where: ReturnType<typeof and>,
    limit: number,
  ): Promise<ItemWithRelations[]> {
    const rows = await this.db
      .select({ item: items, vendor: vendors, city: cities, category: categories })
      .from(items)
      .innerJoin(vendors, eq(vendors.id, items.vendorId))
      .innerJoin(cities, eq(cities.id, vendors.cityId))
      .innerJoin(categories, eq(categories.id, items.categoryId))
      .where(and(eq(items.status, "ACTIVE"), eq(vendors.status, "ACTIVE"), where))
      .orderBy(desc(items.isFeatured), asc(cities.sortOrder), asc(items.name))
      .limit(limit);
    if (rows.length === 0) return [];
    const variants = await this.db
      .select()
      .from(itemVariants)
      .where(
        and(
          inArray(
            itemVariants.itemId,
            rows.map((r) => r.item.id),
          ),
          eq(itemVariants.isActive, true),
        ),
      )
      .orderBy(asc(itemVariants.sortOrder));
    const byItem = new Map<string, VariantRow[]>();
    for (const v of variants) {
      const list = byItem.get(v.itemId) ?? [];
      list.push(v);
      byItem.set(v.itemId, list);
    }
    return rows
      .map((r) => ({ ...r, variants: byItem.get(r.item.id) ?? [] }))
      .filter((r) => r.variants.length > 0);
  }

  /** Earliest delivery of the cheapest variant to a pincode, for every listed item. */
  private async deliverySummaries(
    list: ItemWithRelations[],
    pincode: string,
  ): Promise<Map<string, DeliverySummary>> {
    const loader = new PlanningLoader(this.db, this.deps);
    const dest = await loader.destination(pincode);
    const cheapest = list.map((r) => ({
      r,
      v: r.variants.reduce((a, b) => (a.pricePaise <= b.pricePaise ? a : b)),
    }));
    const availability = await loader.availability(cheapest.map((c) => c.v.id));
    const out = new Map<string, DeliverySummary>();
    await Promise.all(
      cheapest.map(async ({ r, v }) => {
        const problem = destinationProblem(dest, r.vendor.cityId);
        if (problem || !dest) {
          out.set(r.item.id, unavailable(problem ?? "UNKNOWN_PINCODE"));
          return;
        }
        const ctx = await loader.context(
          r.vendor.id,
          dest,
          [shipmentLineFor(r.item, v, 1)],
          availability,
        );
        const result = planShipment(ctx, { kind: "EARLIEST" });
        out.set(
          r.item.id,
          result.ok
            ? {
                available: true,
                promisedDeliveryDate: result.plan.promisedDeliveryDate,
                mode: result.plan.mode,
                orderBy: iso(result.plan.orderCutoffAt),
                deliveryFeePaise: result.plan.shippingFeePaise + result.plan.packagingFeePaise,
              }
            : unavailable(result.reason),
        );
      }),
    );
    return out;
  }

  private card(r: ItemWithRelations, delivery: DeliverySummary | null): ItemCard {
    return {
      id: r.item.id,
      slug: r.item.slug,
      name: r.item.name,
      shortDescription: r.item.shortDescription,
      diet: r.item.diet,
      tempClass: r.item.tempClass,
      shelfLifeHours: r.item.shelfLifeHours,
      freshnessLabel: freshnessLabel(r.item),
      imageUrl: r.item.imageUrl,
      artKey: r.item.artKey,
      isFeatured: r.item.isFeatured,
      category: { slug: r.category.slug, name: r.category.name },
      vendor: vendorSummary({ ...r.vendor, citySlug: r.city.slug, cityName: r.city.name }),
      fromPricePaise: Math.min(...r.variants.map((v) => v.pricePaise)),
      variants: r.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        label: v.label,
        pricePaise: v.pricePaise,
        mrpPaise: v.mrpPaise,
        netWeightG: v.netWeightG,
      })),
      delivery,
    };
  }

  async listItems(query: ItemListQuery): Promise<ItemCard[]> {
    const filters = [];
    if (query.origin) filters.push(eq(cities.slug, query.origin));
    if (query.category) filters.push(eq(categories.slug, query.category));
    if (query.vendor) filters.push(eq(vendors.slug, query.vendor));
    if (query.featured === "true") filters.push(eq(items.isFeatured, true));
    if (query.q?.trim()) {
      const pattern = `%${query.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      filters.push(
        or(
          ilike(items.name, pattern),
          ilike(items.shortDescription, pattern),
          ilike(vendors.name, pattern),
          ilike(cities.name, pattern),
        ),
      );
    }
    const list = await this.loadItems(and(...filters), query.limit ?? 60);
    const deliveries = query.pincode ? await this.deliverySummaries(list, query.pincode) : null;
    return list.map((r) => this.card(r, deliveries?.get(r.item.id) ?? null));
  }

  async getItem(slug: string, pincode?: string): Promise<ItemDetail> {
    const [r] = await this.loadItems(and(eq(items.slug, slug)), 1);
    if (!r) throw notFound("Item");
    const deliveries = pincode ? await this.deliverySummaries([r], pincode) : null;
    return {
      ...this.card(r, deliveries?.get(r.item.id) ?? null),
      description: r.item.description,
      originStory: r.item.originStory,
      freshness: {
        tempClass: r.item.tempClass,
        shelfLifeHours: r.item.shelfLifeHours,
        minResidualHours: r.item.minResidualHours,
        madeToOrder: r.item.madeToOrder,
      },
      legal: { ...r.item.legal, fssaiLicenseNo: r.vendor.fssaiLicenseNo },
      gstRateBps: r.item.gstRateBps,
      vendorStory: r.vendor.story,
    };
  }

  async getVendor(slug: string, pincode?: string): Promise<VendorDetail> {
    const [row] = await this.db
      .select({ v: vendors, c: cities })
      .from(vendors)
      .innerJoin(cities, eq(cities.id, vendors.cityId))
      .where(and(eq(vendors.slug, slug), eq(vendors.status, "ACTIVE")));
    if (!row) throw notFound("Kitchen");
    const itemCards = await this.listItems({ vendor: slug, pincode, limit: 100 });
    return {
      ...vendorSummary({ ...row.v, citySlug: row.c.slug, cityName: row.c.name }),
      story: row.v.story,
      items: itemCards,
    };
  }
}
