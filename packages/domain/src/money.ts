/**
 * Money is always an integer number of paise (₹1 = 100 paise). Floating point rupees never
 * cross a boundary: the database, the API and the engines all speak paise.
 */
export type Paise = number;

export function isPaise(value: number): value is Paise {
  return Number.isSafeInteger(value);
}

export function rupees(amount: number): Paise {
  return Math.round(amount * 100);
}

export function sumPaise(values: Iterable<Paise>): Paise {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** `amount × bps / 10_000`, rounded half-up to the nearest paisa. */
export function applyBps(amount: Paise, bps: number): Paise {
  return Math.round((amount * bps) / 10_000);
}

export function ceilToRupee(amount: Paise): Paise {
  return Math.ceil(amount / 100) * 100;
}

/**
 * GST contained in a tax-inclusive price (Indian B2C prices are displayed inclusive of GST).
 * `inclusive × rate / (1 + rate)`.
 */
export function gstComponentOfInclusive(inclusive: Paise, rateBps: number): Paise {
  return Math.round((inclusive * rateBps) / (10_000 + rateBps));
}

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const inrExact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₹1,249" (whole rupees) or "₹1,249.50" when the amount has paise. */
export function formatINR(amount: Paise): string {
  return amount % 100 === 0 ? inrWhole.format(amount / 100) : inrExact.format(amount / 100);
}
