import { schema } from "@food-del/db";
import { deliveryCalendar, planShipment, REASON_MESSAGES } from "@food-del/domain";
import type { Availability, AvailabilityQuery, PincodeLookup } from "@food-del/domain/contracts";
import { and, eq } from "drizzle-orm";
import type { CoreDeps } from "../deps";
import { notFound } from "../errors";
import { planSummary } from "../mappers";
import { destinationProblem, loadReference, PlanningLoader } from "../planning";
import { shipmentLineFor } from "./catalog";

const { items, itemVariants, vendors } = schema;

export class ServiceabilityService {
  constructor(private readonly deps: CoreDeps) {}

  async lookupPincode(pincode: string): Promise<PincodeLookup> {
    const loader = new PlanningLoader(this.deps.db, this.deps);
    const dest = await loader.destination(pincode);
    const problem = destinationProblem(dest, null);
    return {
      pincode,
      serviceable: problem === null,
      reason: problem,
      message: problem ? REASON_MESSAGES[problem] : null,
      city: dest?.city ? { slug: dest.city.slug, name: dest.city.name } : null,
      district: dest?.district ?? null,
      stateCode: dest?.stateCode ?? null,
      isOda: dest?.isOda ?? false,
    };
  }

  /** Delivery calendar for one variant to one pincode. */
  async availability(q: AvailabilityQuery): Promise<Availability> {
    const [row] = await this.deps.db
      .select({ item: items, variant: itemVariants, vendor: vendors })
      .from(itemVariants)
      .innerJoin(items, eq(items.id, itemVariants.itemId))
      .innerJoin(vendors, eq(vendors.id, items.vendorId))
      .where(
        and(
          eq(itemVariants.id, q.variantId),
          eq(itemVariants.isActive, true),
          eq(items.status, "ACTIVE"),
        ),
      );
    if (!row) throw notFound("Item");

    const loader = new PlanningLoader(this.deps.db, this.deps);
    const dest = await loader.destination(q.pincode);
    const problem = destinationProblem(dest, row.vendor.cityId);
    const base = { variantId: q.variantId, pincode: q.pincode, tempClass: row.item.tempClass };
    if (problem || !dest || row.vendor.status !== "ACTIVE") {
      const reason = problem ?? "ITEM_UNAVAILABLE";
      return { ...base, earliest: null, reason, message: REASON_MESSAGES[reason], days: [] };
    }

    const [ctx, reference] = await Promise.all([
      loader.context(row.vendor.id, dest, [shipmentLineFor(row.item, row.variant, q.qty ?? 1)]),
      loadReference(this.deps.db),
    ]);
    const earliest = planShipment(ctx, { kind: "EARLIEST" });
    const days = deliveryCalendar(ctx, { days: q.days ?? this.deps.config.calendarDays });
    return {
      ...base,
      earliest: earliest.ok ? planSummary(earliest.plan, reference.packagingNames) : null,
      reason: earliest.ok ? null : earliest.reason,
      message: earliest.ok ? null : REASON_MESSAGES[earliest.reason],
      days: days.map((d) => ({
        date: d.date,
        plan: d.plan ? planSummary(d.plan, reference.packagingNames) : null,
        reason: d.reason,
        message: d.reason ? REASON_MESSAGES[d.reason] : null,
      })),
    };
  }
}
