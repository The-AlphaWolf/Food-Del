import { type Executor, schema } from "@food-del/db";
import {
  groupIntoShipments,
  type LocalDate,
  lineTotal,
  type PlanResult,
  planShipment,
  quoteTotals,
  REASON_MESSAGES,
  type ShipmentLine,
  shipmentSubsidy,
} from "@food-del/domain";
import type { Quote, QuoteRequest } from "@food-del/domain/contracts";
import { and, eq, inArray } from "drizzle-orm";
import type { CoreDeps } from "../deps";
import { invalid } from "../errors";
import { iso, planSummary, vendorSummary } from "../mappers";
import {
  type DestinationInfo,
  destinationProblem,
  loadReference,
  PlanningLoader,
  type VendorRow,
} from "../planning";
import { shipmentLineFor } from "./catalog";

const { cities, items, itemVariants, vendors } = schema;

export interface PlannedLine {
  variant: typeof itemVariants.$inferSelect;
  item: typeof items.$inferSelect;
  vendorId: string;
  quantity: number;
  arriveOn: LocalDate | null;
  engineLine: ShipmentLine;
}

export interface PlannedGroup {
  key: string;
  vendor: VendorRow;
  arriveOn: LocalDate | null;
  lines: PlannedLine[];
  result: PlanResult;
  subsidyPaise: number;
}

export interface PlannedCart {
  destination: DestinationInfo;
  groups: PlannedGroup[];
  quote: Quote;
}

/**
 * Plan every parcel in a cart. Used for the cart page (read-only) and inside the place-order
 * transaction, so what the shopper is charged is exactly what they were quoted.
 */
export async function planCart(
  db: Executor,
  deps: CoreDeps,
  request: QuoteRequest,
): Promise<PlannedCart> {
  const loader = new PlanningLoader(db, deps);
  const destination = await loader.destination(request.pincode);
  if (!destination) throw invalid("UNKNOWN_PINCODE", REASON_MESSAGES.UNKNOWN_PINCODE);
  const destProblem = destinationProblem(destination, null);
  if (destProblem) throw invalid(destProblem, REASON_MESSAGES[destProblem]);

  const variantIds = [...new Set(request.lines.map((l) => l.variantId))];
  const rows = await db
    .select({ variant: itemVariants, item: items, vendor: vendors, city: cities })
    .from(itemVariants)
    .innerJoin(items, eq(items.id, itemVariants.itemId))
    .innerJoin(vendors, eq(vendors.id, items.vendorId))
    .innerJoin(cities, eq(cities.id, vendors.cityId))
    .where(and(inArray(itemVariants.id, variantIds)));
  const byVariant = new Map(rows.map((r) => [r.variant.id, r]));
  const missing = variantIds.filter((id) => {
    const r = byVariant.get(id);
    return !r?.variant.isActive || r.item.status !== "ACTIVE" || r.vendor.status !== "ACTIVE";
  });
  if (missing.length > 0) {
    throw invalid("ITEM_UNAVAILABLE", "Some items in your cart are no longer available.", {
      variantIds: missing,
    });
  }

  // Merge duplicate lines (same variant and date) so quantities add up.
  const merged = new Map<
    string,
    { variantId: string; quantity: number; arriveOn: LocalDate | null }
  >();
  for (const l of request.lines) {
    const key = `${l.variantId}|${l.arriveOn ?? ""}`;
    const prev = merged.get(key);
    merged.set(key, {
      variantId: l.variantId,
      arriveOn: l.arriveOn ?? null,
      quantity: (prev?.quantity ?? 0) + l.quantity,
    });
  }

  const planned: (PlannedLine & { tempClass: PlannedLine["item"]["tempClass"] })[] = [
    ...merged.values(),
  ].map((l) => {
    const r = byVariant.get(l.variantId)!;
    return {
      variant: r.variant,
      item: r.item,
      vendorId: r.vendor.id,
      quantity: l.quantity,
      arriveOn: l.arriveOn,
      tempClass: r.item.tempClass,
      engineLine: shipmentLineFor(r.item, r.variant, l.quantity),
    };
  });

  const availability = await loader.availability(variantIds);
  const reference = await loadReference(db);
  const groups: PlannedGroup[] = await Promise.all(
    groupIntoShipments(planned).map(async (g) => {
      const vendor = await loader.vendor(g.vendorId);
      const problem = destinationProblem(destination, vendor.cityId);
      const lines = g.lines.map((l) => l.engineLine);
      let result: PlanResult;
      if (problem) {
        result = { ok: false, reason: problem };
      } else {
        const ctx = await loader.context(vendor.id, destination, lines, availability);
        result = planShipment(
          ctx,
          g.arriveOn ? { kind: "ARRIVE_ON", date: g.arriveOn } : { kind: "EARLIEST" },
        );
      }
      return {
        key: g.key,
        vendor,
        arriveOn: g.arriveOn,
        lines: g.lines,
        result,
        subsidyPaise: shipmentSubsidy({ lines, result }, deps.config.planning.fees),
      };
    }),
  );

  const totals = quoteTotals(
    groups.map((g) => ({ lines: g.lines.map((l) => l.engineLine), result: g.result })),
    deps.config.planning.fees,
  );

  const quote: Quote = {
    pincode: destination.pincode,
    destination: {
      cityName: destination.city?.name ?? destination.district,
      district: destination.district,
      isOda: destination.isOda,
    },
    shipments: groups.map((g) => ({
      key: g.key,
      vendor: vendorSummary(g.vendor),
      arriveOn: g.arriveOn,
      lines: g.lines.map((l) => ({
        variantId: l.variant.id,
        itemId: l.item.id,
        itemSlug: l.item.slug,
        itemName: l.item.name,
        variantLabel: l.variant.label,
        quantity: l.quantity,
        unitPricePaise: l.variant.pricePaise,
        lineTotalPaise: lineTotal(l.engineLine),
        tempClass: l.item.tempClass,
        diet: l.item.diet,
        artKey: l.item.artKey,
        imageUrl: l.item.imageUrl,
      })),
      plan: g.result.ok ? planSummary(g.result.plan, reference.packagingNames) : null,
      issue: g.result.ok
        ? null
        : { reason: g.result.reason, message: REASON_MESSAGES[g.result.reason] },
      subsidyPaise: g.subsidyPaise,
    })),
    totals,
    quotedAt: iso(loader.now),
  };
  return { destination, groups, quote };
}

export class QuoteService {
  constructor(private readonly deps: CoreDeps) {}

  async quote(request: QuoteRequest): Promise<Quote> {
    return (await planCart(this.deps.db, this.deps, request)).quote;
  }
}
