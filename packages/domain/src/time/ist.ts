/**
 * IST (Asia/Kolkata) calendar arithmetic.
 *
 * India has a single time zone with no daylight saving (UTC+05:30), so business rules such as
 * cutoffs, dispatch days and delivery dates are evaluated on IST wall-clock values while every
 * instant is stored as a UTC `Date`. Keeping this dependency-free lets the same code run on the
 * server, in the browser and in React Native (Hermes).
 */

/** Calendar date in IST, formatted `YYYY-MM-DD`. */
export type LocalDate = string;
/** Wall-clock time in IST, formatted `HH:MM` (24h). */
export type LocalTime = string;

export const IST_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isLocalDate(value: string): value is LocalDate {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const probe = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return probe.toISOString().slice(0, 10) === value;
}

export function isLocalTime(value: string): value is LocalTime {
  return TIME_RE.test(value);
}

function dateParts(date: LocalDate): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid LocalDate: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function timeParts(time: LocalTime): [number, number] {
  const m = TIME_RE.exec(time);
  if (!m) throw new RangeError(`Invalid LocalTime: ${time}`);
  return [Number(m[1]), Number(m[2])];
}

/*
 * Planning converts between dates and instants thousands of times per request, always for the
 * same few weeks of dates. These pure conversions are memoised (bounded, so a long-running
 * process can't grow them without limit).
 */
const MEMO_LIMIT = 4096;
const midnightByDate = new Map<LocalDate, number>();
const dateByDayIndex = new Map<number, LocalDate>();

function utcMidnight(date: LocalDate): number {
  let t = midnightByDate.get(date);
  if (t === undefined) {
    const [y, m, d] = dateParts(date);
    t = Date.UTC(y, m - 1, d);
    if (midnightByDate.size >= MEMO_LIMIT) midnightByDate.clear();
    midnightByDate.set(date, t);
  }
  return t;
}

/** `YYYY-MM-DD` of a UTC day index (days since the epoch). */
function dateOfDayIndex(day: number): LocalDate {
  let d = dateByDayIndex.get(day);
  if (d === undefined) {
    d = new Date(day * DAY_MS).toISOString().slice(0, 10);
    if (dateByDayIndex.size >= MEMO_LIMIT) dateByDayIndex.clear();
    dateByDayIndex.set(day, d);
  }
  return d;
}

/** IST calendar date of an instant. */
export function istDateOf(instant: Date): LocalDate {
  return dateOfDayIndex(Math.floor((instant.getTime() + IST_OFFSET_MS) / DAY_MS));
}

/** IST wall-clock time of an instant. */
export function istTimeOf(instant: Date): LocalTime {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);
}

/** The instant at which the IST wall clock shows `time` on `date`. */
export function atIst(date: LocalDate, time: LocalTime): Date {
  const [hh, mm] = timeParts(time);
  return new Date(utcMidnight(date) + hh * HOUR_MS + mm * 60_000 - IST_OFFSET_MS);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return dateOfDayIndex(Math.round(utcMidnight(date) / DAY_MS) + days);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function isoWeekday(date: LocalDate): number {
  const wd = new Date(utcMidnight(date)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function addHours(instant: Date, hours: number): Date {
  return new Date(instant.getTime() + hours * HOUR_MS);
}

export function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / HOUR_MS;
}

export function compareLocalDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------------------------------------------------------------------------
// Weekday bitmasks (bit 0 = Monday … bit 6 = Sunday)
// ---------------------------------------------------------------------------

export const WEEKDAYS_ALL = 0b1111111;
export const WEEKDAYS_MON_SAT = 0b0111111;

export function weekdayMask(isoDays: readonly number[]): number {
  return isoDays.reduce((mask, d) => {
    if (d < 1 || d > 7) throw new RangeError(`ISO weekday out of range: ${d}`);
    return mask | (1 << (d - 1));
  }, 0);
}

export function isWeekdayInMask(mask: number, isoDay: number): boolean {
  return (mask & (1 << (isoDay - 1))) !== 0;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const shortDateFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: IST_TIME_ZONE,
});

/** "Thu, 16 Oct" */
export function formatLocalDate(date: LocalDate): string {
  return shortDateFmt.format(new Date(utcMidnight(date)));
}

/** "6:00 pm" in IST */
export function formatIstTime(instant: Date): string {
  return timeFmt.format(instant);
}
