import { canShareBox, type TempClass } from "../catalog";
import { gstComponentOfInclusive, type Paise } from "../money";
import type { PlanResult } from "../serviceability/planner";
import type { ShipmentLine } from "../serviceability/types";
import type { LocalDate } from "../time/ist";
import { type FeePolicy, shippingSubsidy } from "./rates";

export interface GroupableLine {
  vendorId: string;
  arriveOn: LocalDate | null;
  tempClass: TempClass;
}

export interface ShipmentGroup<L extends GroupableLine> {
  /** Stable identifier for the group within one cart. */
  key: string;
  vendorId: string;
  arriveOn: LocalDate | null;
  lines: L[];
}

/**
 * Split a cart into parcels: one per vendor and requested arrival date, with frozen goods kept
 * apart from everything else (they cannot share a box). Order of first appearance is preserved
 * so the cart UI stays stable.
 */
export function groupIntoShipments<L extends GroupableLine>(
  lines: readonly L[],
): ShipmentGroup<L>[] {
  const groups = new Map<string, ShipmentGroup<L>>();
  for (const line of lines) {
    const tempKey = canShareBox(line.tempClass, "AMBIENT") ? "std" : "frozen";
    const key = `${line.vendorId}|${line.arriveOn ?? "earliest"}|${tempKey}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, vendorId: line.vendorId, arriveOn: line.arriveOn, lines: [] };
      groups.set(key, g);
    }
    g.lines.push(line);
  }
  return [...groups.values()];
}

export interface PricedShipment {
  lines: readonly ShipmentLine[];
  result: PlanResult;
}

export interface QuoteTotals {
  itemsTotalPaise: Paise;
  shippingFeePaise: Paise;
  packagingFeePaise: Paise;
  discountPaise: Paise;
  grandTotalPaise: Paise;
  /** GST already contained in the item prices (informational, for the invoice). */
  gstIncludedPaise: Paise;
  /** False when any shipment could not be planned; such a quote cannot be checked out. */
  isComplete: boolean;
}

export function lineTotal(l: Pick<ShipmentLine, "unitPricePaise" | "quantity">): Paise {
  return l.unitPricePaise * l.quantity;
}

/** Per-shipment subsidy given the fee policy (0 for unplannable shipments). */
export function shipmentSubsidy(s: PricedShipment, policy: FeePolicy): Paise {
  if (!s.result.ok) return 0;
  const itemValue = s.lines.reduce((sum, l) => sum + lineTotal(l), 0);
  return shippingSubsidy(itemValue, s.result.plan.shippingFeePaise, policy);
}

export function quoteTotals(shipments: readonly PricedShipment[], policy: FeePolicy): QuoteTotals {
  let itemsTotalPaise = 0;
  let shippingFeePaise = 0;
  let packagingFeePaise = 0;
  let discountPaise = 0;
  let gstIncludedPaise = 0;
  let isComplete = shipments.length > 0;
  for (const s of shipments) {
    for (const l of s.lines) {
      itemsTotalPaise += lineTotal(l);
      gstIncludedPaise += gstComponentOfInclusive(lineTotal(l), l.gstRateBps);
    }
    if (s.result.ok) {
      shippingFeePaise += s.result.plan.shippingFeePaise;
      packagingFeePaise += s.result.plan.packagingFeePaise;
      discountPaise += shipmentSubsidy(s, policy);
    } else {
      isComplete = false;
    }
  }
  return {
    itemsTotalPaise,
    shippingFeePaise,
    packagingFeePaise,
    discountPaise,
    grandTotalPaise: itemsTotalPaise + shippingFeePaise + packagingFeePaise - discountPaise,
    gstIncludedPaise,
    isComplete,
  };
}
