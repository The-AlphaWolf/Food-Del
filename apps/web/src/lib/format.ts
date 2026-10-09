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
