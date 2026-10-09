/** Shared DTO builders: engine and database shapes → API contract shapes. */
import type { ShipmentPlan } from "@food-del/domain";
import type { PlanSummary, VendorSummary } from "@food-del/domain/contracts";
import type { VendorRow } from "./planning";

export const iso = (d: Date) => d.toISOString();
export const isoOrNull = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function planSummary(
  plan: ShipmentPlan,
  packaging: Map<string, { name: string; coolant: string }>,
): PlanSummary {
  const pkg = packaging.get(plan.packagingCode);
  return {
    dispatchDate: plan.dispatchDate,
    promisedDeliveryDate: plan.promisedDeliveryDate,
    usuallyArrivesOn: plan.usuallyArrivesOn,
    orderCutoffAt: iso(plan.orderCutoffAt),
    deliverByAt: iso(plan.deliverByAt),
    mode: plan.mode,
    carrierCode: plan.carrierCode,
    packagingCode: plan.packagingCode,
    packagingName: pkg?.name ?? plan.packagingCode,
    coldChain: (pkg?.coolant ?? "NONE") !== "NONE",
    shippingFeePaise: plan.shippingFeePaise,
    packagingFeePaise: plan.packagingFeePaise,
    freshnessMarginHours: Math.floor(plan.freshnessMarginHours),
    remainingUnits: Number.isFinite(plan.remainingUnits) ? plan.remainingUnits : 0,
  };
}

export function vendorSummary(
  v: Pick<
    VendorRow,
    "id" | "slug" | "name" | "tagline" | "establishedYear" | "citySlug" | "cityName"
  >,
): VendorSummary {
  return {
    id: v.id,
    slug: v.slug,
    name: v.name,
    tagline: v.tagline,
    establishedYear: v.establishedYear,
    city: { slug: v.citySlug, name: v.cityName },
  };
}

/** Short order reference: FD-YYMMDD-XXXXX (Crockford base32, no ambiguous letters). */
export function newOrderNumber(now: Date): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const ist = new Date(now.getTime() + 330 * 60_000).toISOString();
  const ymd = `${ist.slice(2, 4)}${ist.slice(5, 7)}${ist.slice(8, 10)}`;
  let suffix = "";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  for (const b of bytes) suffix += alphabet[b % 32];
  return `FD-${ymd}-${suffix}`;
}
