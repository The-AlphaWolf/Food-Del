import {
  formatINR,
  formatLocalDate,
  formatLongDate,
  SHIP_MODE_LABELS,
  type ShipMode,
} from "@food-del/domain";

export { formatINR, formatLocalDate, formatLongDate };

export function modeLabel(mode: ShipMode): string {
  return SHIP_MODE_LABELS[mode];
}

const dateTime = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

/** "Mon, 12 Oct, 6:00 pm" in IST. */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

/** "in 3 h", "in 2 days", "5 h ago". */
export function relativeHours(iso: string, now = Date.now()): string {
  const h = (new Date(iso).getTime() - now) / 3_600_000;
  const abs = Math.abs(h);
  const text =
    abs < 1
      ? `${Math.max(1, Math.round(abs * 60))} min`
      : abs < 48
        ? `${Math.round(abs)} h`
        : `${Math.round(abs / 24)} days`;
  return h >= 0 ? `in ${text}` : `${text} ago`;
}

/**
 * Headline amounts in Indian units: ₹7,800 in full below a lakh, then ₹1.3L and ₹5.2Cr.
 * Hand-rolled because Intl's compact "en-IN" output differs between runtimes ("K" vs "T").
 */
export function formatINRCompact(paise: number): string {
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  const short = (n: number, unit: string) =>
    `${rupees < 0 ? "−" : ""}₹${(Math.round((abs / n) * 10) / 10).toLocaleString("en-IN")}${unit}`;
  if (abs >= 1e7) return short(1e7, "Cr");
  if (abs >= 1e5) return short(1e5, "L");
  return formatINR(paise);
}
