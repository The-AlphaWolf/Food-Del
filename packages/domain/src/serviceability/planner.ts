import { isPackagingCompatible, strictestTemp } from "../catalog";
import type { Paise } from "../money";
import { chargeableWeightG } from "../packaging";
import { customerPackagingFee, customerShippingFee, freightCostPaise } from "../pricing/rates";
import {
  addDays,
  addHours,
  atIst,
  dateRange,
  hoursBetween,
  isLocalTime,
  isoWeekday,
  istDateOf,
  isWeekdayInMask,
  type LocalDate,
  minDate,
} from "../time/ist";
import {
  type CalendarReason,
  type CandidateReason,
  deeperReason,
  type RequestReason,
} from "./reasons";
import type { Lane, PlanGoal, PlanningContext, ShipmentLine, ShipmentPlan } from "./types";

/** The result of evaluating one (dispatch date, lane) pair. */
export interface CandidateOutcome {
  dispatchDate: LocalDate;
  carrierCode: string;
  mode: Lane["mode"];
  /** The promised delivery date this candidate would have, feasible or not. */
  wouldArriveOn: LocalDate;
  plan: ShipmentPlan | null;
  reason: CandidateReason | null;
}

export type PlanResult =
  | { ok: true; plan: ShipmentPlan }
  | { ok: false; reason: CandidateReason | RequestReason | CalendarReason };

export interface CalendarDay {
  date: LocalDate;
  plan: ShipmentPlan | null;
  reason: CandidateReason | CalendarReason | null;
}

const EMPTY_SET: ReadonlySet<LocalDate> = new Set();

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Problems with the planning input, or an empty list when it is usable. */
export function validatePlanningContext(ctx: PlanningContext): string[] {
  const issues: string[] = [];
  const v = ctx.vendor;
  for (const [field, value] of [
    ["orderCutoffLocal", v.orderCutoffLocal],
    ["prepStartLocal", v.prepStartLocal],
    ["readyForPickupLocal", v.readyForPickupLocal],
  ] as const) {
    if (!isLocalTime(value)) issues.push(`vendor.${field} is not HH:MM`);
  }
  if (!Number.isInteger(v.prepLeadDays) || v.prepLeadDays < 0) issues.push("vendor.prepLeadDays");
  if (!Number.isInteger(v.dailyShipmentCap) || v.dailyShipmentCap < 0) {
    issues.push("vendor.dailyShipmentCap");
  }
  if (ctx.lines.length === 0) issues.push("no lines");
  for (const l of ctx.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) issues.push(`${l.variantId}: quantity`);
    if (!(l.unitPackedWeightG > 0)) issues.push(`${l.variantId}: weight`);
    if (!(l.freshness.shelfLifeHours > 0)) issues.push(`${l.variantId}: shelf life`);
    if (l.freshness.minResidualHours >= l.freshness.shelfLifeHours) {
      issues.push(`${l.variantId}: residual ≥ shelf life`);
    }
    if (!l.freshness.madeToOrder && l.freshness.maxAgeAtDispatchHours == null) {
      issues.push(`${l.variantId}: stock item without max age`);
    }
  }
  for (const lane of ctx.lanes) {
    if (lane.transitHoursP90 < lane.transitHoursP50) issues.push(`${lane.carrierCode}: p90 < p50`);
    if (!isLocalTime(lane.pickupCutoffLocal)) issues.push(`${lane.carrierCode}: pickup cutoff`);
  }
  if (!(ctx.policy.horizonDays >= 0)) issues.push("policy.horizonDays");
  return issues;
}

// ---------------------------------------------------------------------------
// Candidate evaluation
// ---------------------------------------------------------------------------

/**
 * Couriers don't deliver on Sundays (unless the lane says so) or on their holidays: a parcel
 * that would arrive then waits a day, which also eats into shelf life.
 */
function rollToDeliveryDay(eta: Date, lane: Lane, carrierClosed: ReadonlySet<LocalDate>): Date {
  let e = eta;
  for (let i = 0; i < 14; i++) {
    const day = istDateOf(e);
    if ((isoWeekday(day) === 7 && !lane.deliversSunday) || carrierClosed.has(day)) {
      e = addHours(e, 24);
      continue;
    }
    return e;
  }
  return e;
}

function preparedAtFor(line: ShipmentLine, ctx: PlanningContext, dispatchDate: LocalDate): Date {
  const packedAt = atIst(dispatchDate, ctx.vendor.readyForPickupLocal);
  if (!line.freshness.madeToOrder) {
    return addHours(packedAt, -(line.freshness.maxAgeAtDispatchHours ?? 0));
  }
  const prep = atIst(dispatchDate, ctx.vendor.prepStartLocal);
  return prep.getTime() > packedAt.getTime() ? addHours(prep, -24) : prep;
}

interface PackagingChoice {
  packagingCode: string;
  deadWeightG: number;
  chargeableWeightG: number;
  shippingCostPaise: Paise;
  shippingFeePaise: Paise;
  packagingFeePaise: Paise;
}

function choosePackaging(
  ctx: PlanningContext,
  lane: Lane,
  packedAt: Date,
  etaP90: Date,
): PackagingChoice | CandidateReason {
  const temps = ctx.lines.map((l) => l.freshness.tempClass);
  const payloadG = ctx.lines.reduce((s, l) => s + l.unitPackedWeightG * l.quantity, 0);
  const holdNeeded = hoursBetween(packedAt, etaP90) + ctx.policy.handlingBufferHours;
  const rate = ctx.rateCards.find(
    (r) => r.carrierCode === lane.carrierCode && r.mode === lane.mode && r.zone === lane.rateZone,
  );
  if (!rate) return "NO_RATE_CARD";

  let best: PackagingChoice | null = null;
  let reason: CandidateReason = "NO_COMPATIBLE_PACKAGING";
  for (const pkg of ctx.packaging) {
    let failure: CandidateReason | null = null;
    if (!temps.every((t) => isPackagingCompatible(pkg.tempClass, t))) {
      failure = "NO_COMPATIBLE_PACKAGING";
    } else if (payloadG > pkg.maxPayloadG) failure = "EXCEEDS_BOX_PAYLOAD";
    else if (pkg.coolant === "DRY_ICE" && !lane.acceptsDryIce) failure = "DRY_ICE_NOT_ACCEPTED";
    else if (holdNeeded > pkg.maxHoldHours) failure = "PACKAGING_HOLD_EXCEEDED";
    if (failure) {
      reason = deeperReason(reason, failure);
      continue;
    }
    const deadWeightG = payloadG + pkg.tareWeightG;
    const chargeable = chargeableWeightG(deadWeightG, pkg.outerDimsMm, rate.volumetricDivisor);
    const cost = freightCostPaise(rate, chargeable, ctx.destination.isOda);
    const choice: PackagingChoice = {
      packagingCode: pkg.code,
      deadWeightG,
      chargeableWeightG: chargeable,
      shippingCostPaise: cost,
      shippingFeePaise: customerShippingFee(cost, ctx.policy.fees),
      packagingFeePaise: customerPackagingFee(pkg.costPaise, ctx.policy.fees),
    };
    const total = choice.shippingFeePaise + choice.packagingFeePaise;
    const bestTotal = best
      ? best.shippingFeePaise + best.packagingFeePaise
      : Number.POSITIVE_INFINITY;
    if (total < bestTotal || (total === bestTotal && best && pkg.code < best.packagingCode)) {
      best = choice;
    }
  }
  return best ?? reason;
}

/**
 * Evaluate every (dispatch date, lane) pair within the horizon. Checks run structural first
 * (pickup timing, rates, shelf life, packaging), then calendar, then cutoff, then capacity, so
 * each failure carries the most actionable reason.
 */
export function evaluateCandidates(
  ctx: PlanningContext,
  options: { earliestOnly?: boolean } = {},
): CandidateOutcome[] {
  const today = istDateOf(ctx.now);
  const out: CandidateOutcome[] = [];
  const itemsTotalPaise = ctx.lines.reduce((s, l) => s + l.unitPricePaise * l.quantity, 0);
  const odaHours = ctx.destination.isOda ? ctx.policy.odaExtraHours : 0;
  let earliestEta = Number.POSITIVE_INFINITY;

  for (const dispatchDate of dateRange(today, addDays(today, ctx.policy.horizonDays))) {
    // A parcel can't arrive before the day it leaves, so once dispatch days pass the earliest
    // arrival found, nothing later can beat it. Catalogue cards ask this for every item.
    if (options.earliestOnly && atIst(dispatchDate, "00:00").getTime() > earliestEta) break;
    const packedAt = atIst(dispatchDate, ctx.vendor.readyForPickupLocal);
    const preparedTimes = ctx.lines.map((l) => preparedAtFor(l, ctx, dispatchDate));
    const deliverByAt = ctx.lines
      .map((l, i) =>
        addHours(preparedTimes[i]!, l.freshness.shelfLifeHours - l.freshness.minResidualHours),
      )
      .reduce(minDate);
    const preparedAt = preparedTimes.reduce(minDate);
    const orderCutoffAt = atIst(
      addDays(dispatchDate, -ctx.vendor.prepLeadDays),
      ctx.vendor.orderCutoffLocal,
    );

    for (const lane of ctx.lanes) {
      const carrierClosed = ctx.blackouts.carrier.get(lane.carrierCode) ?? EMPTY_SET;
      const pickupBy = atIst(dispatchDate, lane.pickupCutoffLocal);
      const etaP90 = rollToDeliveryDay(
        addHours(pickupBy, lane.transitHoursP90 + odaHours),
        lane,
        carrierClosed,
      );
      const etaP50 = rollToDeliveryDay(
        addHours(pickupBy, lane.transitHoursP50 + odaHours),
        lane,
        carrierClosed,
      );
      const base = {
        dispatchDate,
        carrierCode: lane.carrierCode,
        mode: lane.mode,
        wouldArriveOn: istDateOf(etaP90),
      };
      const fail = (reason: CandidateReason): CandidateOutcome => ({ ...base, plan: null, reason });

      // Structural: can this lane ever carry this parcel from this kitchen?
      if (ctx.vendor.readyForPickupLocal > lane.pickupCutoffLocal) {
        out.push(fail("PICKUP_CUTOFF_MISSED"));
        continue;
      }
      const hasRate = ctx.rateCards.some(
        (r) =>
          r.carrierCode === lane.carrierCode && r.mode === lane.mode && r.zone === lane.rateZone,
      );
      if (!hasRate) {
        out.push(fail("NO_RATE_CARD"));
        continue;
      }
      if (etaP90.getTime() > deliverByAt.getTime()) {
        out.push(fail("SHELF_LIFE_EXCEEDED"));
        continue;
      }
      const packaging = choosePackaging(ctx, lane, packedAt, etaP90);
      if (typeof packaging === "string") {
        out.push(fail(packaging));
        continue;
      }

      // Calendar: is anyone working that day?
      const weekday = isoWeekday(dispatchDate);
      if (
        !isWeekdayInMask(ctx.vendor.dispatchWeekdays, weekday) ||
        ctx.blackouts.dispatch.has(dispatchDate)
      ) {
        out.push(fail("VENDOR_CLOSED"));
        continue;
      }
      if (carrierClosed.has(dispatchDate)) {
        out.push(fail("CARRIER_CLOSED"));
        continue;
      }

      // Cutoff: is it too late to order for this dispatch?
      if (ctx.now.getTime() > orderCutoffAt.getTime()) {
        out.push(fail("CUTOFF_PASSED"));
        continue;
      }

      // Capacity: kitchen bench and per-item caps.
      if (ctx.bookedShipments(dispatchDate) >= ctx.vendor.dailyShipmentCap) {
        out.push(fail("VENDOR_AT_CAPACITY"));
        continue;
      }
      let remainingUnits = Number.POSITIVE_INFINITY;
      let soldOut = false;
      for (const l of ctx.lines) {
        const available = ctx.availableUnits(l.variantId, dispatchDate);
        remainingUnits = Math.min(remainingUnits, available);
        if (available < l.quantity) soldOut = true;
      }
      if (soldOut) {
        out.push(fail("SOLD_OUT"));
        continue;
      }

      earliestEta = Math.min(earliestEta, etaP90.getTime());
      out.push({
        ...base,
        reason: null,
        plan: {
          dispatchDate,
          carrierCode: lane.carrierCode,
          mode: lane.mode,
          rateZone: lane.rateZone,
          packagingCode: packaging.packagingCode,
          orderCutoffAt,
          preparedAt,
          packedAt,
          pickupBy,
          etaP50,
          etaP90,
          usuallyArrivesOn: istDateOf(etaP50),
          promisedDeliveryDate: istDateOf(etaP90),
          deliverByAt,
          freshnessMarginHours: hoursBetween(etaP90, deliverByAt),
          deadWeightG: packaging.deadWeightG,
          chargeableWeightG: packaging.chargeableWeightG,
          shippingCostPaise: packaging.shippingCostPaise,
          shippingFeePaise: packaging.shippingFeePaise,
          packagingFeePaise: packaging.packagingFeePaise,
          itemsTotalPaise,
          remainingUnits,
        },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function fee(p: ShipmentPlan): number {
  return p.shippingFeePaise + p.packagingFeePaise;
}

function tieBreak(a: ShipmentPlan, b: ShipmentPlan): number {
  return (
    a.carrierCode.localeCompare(b.carrierCode) || a.packagingCode.localeCompare(b.packagingCode)
  );
}

/** Earliest arrival, then cheapest, then freshest. */
function compareEarliest(a: ShipmentPlan, b: ShipmentPlan): number {
  return (
    a.etaP90.getTime() - b.etaP90.getTime() ||
    fee(a) - fee(b) ||
    b.dispatchDate.localeCompare(a.dispatchDate) ||
    tieBreak(a, b)
  );
}

/**
 * Among plans arriving the same day: perishables go for the freshest food (latest dispatch),
 * shelf-stable goods for the lowest fee.
 */
function comparatorForSameDay(ctx: PlanningContext) {
  const perishable = strictestTemp(ctx.lines.map((l) => l.freshness.tempClass)) !== "AMBIENT";
  return (a: ShipmentPlan, b: ShipmentPlan): number => {
    const fresher = b.dispatchDate.localeCompare(a.dispatchDate);
    const cheaper = fee(a) - fee(b);
    const primary = perishable ? fresher || cheaper : cheaper || fresher;
    return primary || a.etaP90.getTime() - b.etaP90.getTime() || tieBreak(a, b);
  };
}

function deepestReason(outcomes: readonly CandidateOutcome[]): CandidateReason | null {
  let reason: CandidateReason | null = null;
  for (const o of outcomes) {
    if (o.reason) reason = reason ? deeperReason(reason, o.reason) : o.reason;
  }
  return reason;
}

/** Plan one shipment for a goal. Pure and deterministic for a given context. */
export function planShipment(ctx: PlanningContext, goal: PlanGoal): PlanResult {
  if (validatePlanningContext(ctx).length > 0) return { ok: false, reason: "INVALID_REQUEST" };
  if (ctx.lanes.length === 0) return { ok: false, reason: "NO_LANE" };

  const outcomes = evaluateCandidates(ctx, { earliestOnly: goal.kind === "EARLIEST" });

  if (goal.kind === "EARLIEST") {
    const plans = outcomes.flatMap((o) => (o.plan ? [o.plan] : []));
    if (plans.length === 0) return { ok: false, reason: deepestReason(outcomes) ?? "NO_LANE" };
    return { ok: true, plan: plans.sort(compareEarliest)[0]! };
  }

  return dayResult(ctx, outcomes, goal.date);
}

function dayResult(
  ctx: PlanningContext,
  outcomes: readonly CandidateOutcome[],
  date: LocalDate,
): PlanResult {
  const sameDay = outcomes.filter((o) => o.wouldArriveOn === date);
  const plans = sameDay.flatMap((o) => (o.plan ? [o.plan] : []));
  if (plans.length > 0) return { ok: true, plan: plans.sort(comparatorForSameDay(ctx))[0]! };

  const reason = deepestReason(sameDay);
  if (reason) return { ok: false, reason };

  const arrivals = outcomes.map((o) => o.wouldArriveOn).sort();
  const first = arrivals[0];
  const last = arrivals[arrivals.length - 1];
  if (first !== undefined && date < first) return { ok: false, reason: "TOO_SOON" };
  if (last !== undefined && date > last) return { ok: false, reason: "BEYOND_HORIZON" };
  return { ok: false, reason: "NO_DELIVERY_ON_DAY" };
}

/**
 * The delivery-date picker: for each of the next `days` dates, the best plan that arrives on that
 * day, or the reason none does.
 */
export function deliveryCalendar(
  ctx: PlanningContext,
  options: { from?: LocalDate; days: number },
): CalendarDay[] {
  const from = options.from ?? istDateOf(ctx.now);
  const dates = dateRange(from, addDays(from, options.days - 1));
  if (validatePlanningContext(ctx).length > 0 || ctx.lanes.length === 0) {
    return dates.map((date) => ({ date, plan: null, reason: "NO_DELIVERY_ON_DAY" }));
  }
  const outcomes = evaluateCandidates(ctx);
  return dates.map((date) => {
    const r = dayResult(ctx, outcomes, date);
    if (r.ok) return { date, plan: r.plan, reason: null };
    const reason = r.reason as CandidateReason | CalendarReason;
    return { date, plan: null, reason };
  });
}
