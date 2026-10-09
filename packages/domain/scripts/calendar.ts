/**
 * Print the delivery calendar for a sample delicacy, using the fixture lanes, packaging and
 * rate cards. Useful for sanity-checking rule changes by eye.
 *
 *   pnpm calendar -- --item sandesh --days 14 --oda --now 2026-10-12T18:30
 */
import { parseArgs } from "node:util";
import {
  atIst,
  deliveryCalendar,
  type FreshnessProfile,
  formatINR,
  formatIstTime,
  formatLocalDate,
  freshnessLabel,
  istDateOf,
  planShipment,
  REASON_MESSAGES,
  SHIP_MODE_LABELS,
} from "../src";
import {
  CANNED_ROSOGOLLA,
  FIXTURE_NOW,
  KAJU_KATLI,
  line,
  NOLEN_GUR_SANDESH,
  planningContext,
} from "../src/testing";

const ITEMS: Record<string, { name: string; freshness: FreshnessProfile }> = {
  katli: { name: "Kaju katli (500 g)", freshness: KAJU_KATLI },
  sandesh: { name: "Nolen gur sandesh (500 g)", freshness: NOLEN_GUR_SANDESH },
  rosogolla: { name: "Canned rosogolla (1 kg)", freshness: CANNED_ROSOGOLLA },
};

const { values } = parseArgs({
  options: {
    item: { type: "string", default: "sandesh" },
    qty: { type: "string", default: "1" },
    days: { type: "string", default: "14" },
    oda: { type: "boolean", default: false },
    now: { type: "string" },
  },
});

const item = ITEMS[values.item ?? "sandesh"];
if (!item) {
  console.error(`Unknown item. Choose one of: ${Object.keys(ITEMS).join(", ")}`);
  process.exit(1);
}

const now = values.now
  ? atIst(values.now.slice(0, 10), values.now.slice(11, 16) || "09:00")
  : FIXTURE_NOW;

const ctx = planningContext({
  now,
  lines: [line(item.freshness, { quantity: Number(values.qty) })],
  destination: { pincode: values.oda ? "741101" : "560001", isOda: values.oda ?? false },
});

console.log(`\n${item.name} · ${freshnessLabel(item.freshness)}`);
console.log(
  `Kolkata → ${values.oda ? "ODA pincode" : "Bengaluru 560001"} · ordering at ${now.toISOString()}\n`,
);

const earliest = planShipment(ctx, { kind: "EARLIEST" });
console.log(
  earliest.ok
    ? `Earliest: arrives by ${formatLocalDate(earliest.plan.promisedDeliveryDate)} (order by ${formatLocalDate(
        istDateOf(earliest.plan.orderCutoffAt),
      )} ${formatIstTime(earliest.plan.orderCutoffAt)})\n`
    : `Not serviceable: ${REASON_MESSAGES[earliest.reason]}\n`,
);

for (const day of deliveryCalendar(ctx, { days: Number(values.days) })) {
  const label = formatLocalDate(day.date).padEnd(13);
  if (!day.plan) {
    console.log(`  ${label} ✗ ${REASON_MESSAGES[day.reason ?? "NO_DELIVERY_ON_DAY"]}`);
    continue;
  }
  const p = day.plan;
  console.log(
    `  ${label} ✓ ${SHIP_MODE_LABELS[p.mode].padEnd(15)} dispatch ${formatLocalDate(p.dispatchDate).padEnd(12)} ` +
      `${p.packagingCode.padEnd(13)} ship ${formatINR(p.shippingFeePaise).padStart(7)} + box ${formatINR(
        p.packagingFeePaise,
      ).padStart(
        5,
      )} · ${Math.floor(p.freshnessMarginHours)} h spare freshness · ${p.remainingUnits} left`,
  );
}
console.log();
