/**
 * Rules for bringing kitchens, delicacies, routes and cities onto the platform. Pure, so the ops
 * console can check a form before it is sent and the server can enforce the same rules.
 */

/** URL slug from a display name: "Bagbazar Mishti Ghar" → "bagbazar-mishti-ghar". */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** FSSAI licence and registration numbers are 14 digits. */
export const FSSAI_RE = /^\d{14}$/;
/** 2-digit state code, 10-character PAN, entity number, "Z", checksum. */
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** Harmonised System of Nomenclature code for food (4, 6 or 8 digits). */
export const HSN_RE = /^\d{4}(?:\d{2}){0,2}$/;
export const HHMM_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const STATE_CODE_RE = /^[A-Z]{2}$/;
export const IATA_RE = /^[A-Z]{3}$/;

/** GST slabs that apply to packaged food, in basis points. */
export const GST_RATES_BPS = [0, 500, 1200, 1800] as const;

/** Illustrated motifs available until photography lands. */
export const ART_KEYS = [
  "sandesh",
  "rosogolla",
  "laddoo",
  "barfi",
  "halwa",
  "biscuit",
  "namkeen",
  "pickle",
  "peda",
  "pak",
  "jar",
] as const;
export type ArtKey = (typeof ART_KEYS)[number];

/** Licences must stay valid this long after go-live, so renewals never interrupt dispatch. */
export const FSSAI_MIN_VALIDITY_DAYS = 30;

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** "Mon–Sat", "Mon, Wed, Fri", "Every day" from an ISO weekday bitmask (bit 0 = Monday). */
export function describeWeekdays(mask: number): string {
  if ((mask & 127) === 127) return "Every day";
  const days = WEEKDAY_SHORT.filter((_, i) => (mask & (1 << i)) !== 0);
  if (days.length === 0) return "No dispatch days";
  const first = WEEKDAY_SHORT.indexOf(days[0]!);
  const contiguous = days.every((d, i) => WEEKDAY_SHORT.indexOf(d) === first + i);
  return contiguous && days.length >= 3 ? `${days[0]}–${days[days.length - 1]}` : days.join(", ");
}

export interface KitchenFacts {
  fssaiValidUntil: string;
  /** Today in IST. */
  today: string;
  owners: number;
  /** Active delicacies with at least one active pack size. */
  sellableItems: number;
  cityIsOrigin: boolean;
  /** Active routes leaving the kitchen's city. */
  routesFromCity: number;
  dispatchWeekdays: number;
  payoutAccountLinked: boolean;
}

export const READINESS_KEYS = [
  "FSSAI_VALID",
  "OWNER_ACCOUNT",
  "SELLABLE_ITEM",
  "CITY_SHIPS_OUT",
  "DISPATCH_DAYS",
  "PAYOUT_ACCOUNT",
] as const;
export type ReadinessKey = (typeof READINESS_KEYS)[number];

export interface ReadinessCheck {
  key: ReadinessKey;
  label: string;
  ok: boolean;
  /** Blocking checks must pass before the kitchen can go live. */
  blocking: boolean;
  detail: string;
}

/** "31 Mar 2030": licence dates need the year, unlike delivery dates. */
export function formatLongDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** What still stands between a kitchen and its first order. */
export function assessKitchenReadiness(f: KitchenFacts): ReadinessCheck[] {
  const licenceDays = daysBetween(f.today, f.fssaiValidUntil);
  return [
    {
      key: "FSSAI_VALID",
      label: "FSSAI licence valid",
      ok: licenceDays >= FSSAI_MIN_VALIDITY_DAYS,
      blocking: true,
      detail:
        licenceDays < 0
          ? "The licence has expired."
          : licenceDays < FSSAI_MIN_VALIDITY_DAYS
            ? `Expires in ${licenceDays} days; renew before going live.`
            : `Valid until ${formatLongDate(f.fssaiValidUntil)}.`,
    },
    {
      key: "OWNER_ACCOUNT",
      label: "Owner can sign in",
      ok: f.owners > 0,
      blocking: true,
      detail:
        f.owners > 0
          ? `${plural(f.owners, "owner", "owners")} invited.`
          : "Add the owner's mobile number.",
    },
    {
      key: "SELLABLE_ITEM",
      label: "At least one delicacy on sale",
      ok: f.sellableItems > 0,
      blocking: true,
      detail:
        f.sellableItems > 0 ? `${f.sellableItems} on sale.` : "Add a delicacy and set it on sale.",
    },
    {
      key: "CITY_SHIPS_OUT",
      label: "Routes out of the kitchen's city",
      ok: f.cityIsOrigin && f.routesFromCity > 0,
      blocking: true,
      detail: !f.cityIsOrigin
        ? "The city isn't set up to ship out yet."
        : f.routesFromCity > 0
          ? `Ships to ${plural(f.routesFromCity, "city", "cities")}.`
          : "Add at least one route from this city.",
    },
    {
      key: "DISPATCH_DAYS",
      label: "Dispatch days set",
      ok: (f.dispatchWeekdays & 127) !== 0,
      blocking: true,
      detail: describeWeekdays(f.dispatchWeekdays),
    },
    {
      key: "PAYOUT_ACCOUNT",
      label: "Payout account linked",
      ok: f.payoutAccountLinked,
      blocking: false,
      detail: f.payoutAccountLinked
        ? "Razorpay Route account linked."
        : "Payouts are held until a Razorpay Route account is linked.",
    },
  ];
}

export function isReadyToGoLive(checks: readonly ReadinessCheck[]): boolean {
  return checks.every((c) => c.ok || !c.blocking);
}

/** Parse "560001-560099, 560103" into inclusive pincode ranges. */
export function parsePincodeRanges(input: string): { from: number; to: number }[] | null {
  const parts = input
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const ranges: { from: number; to: number }[] = [];
  for (const part of parts) {
    const m = /^([1-9]\d{5})(?:-([1-9]\d{5}))?$/.exec(part);
    if (!m) return null;
    const from = Number(m[1]);
    const to = Number(m[2] ?? m[1]);
    if (to < from || to - from > 2000) return null;
    ranges.push({ from, to });
  }
  return ranges;
}
