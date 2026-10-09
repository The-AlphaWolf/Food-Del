/** Indian postal geography. */

/** Six digits, never starting with 0. */
export const PINCODE_RE = /^[1-9]\d{5}$/;

export function isValidPincode(value: string): boolean {
  return PINCODE_RE.test(value);
}

/** Normalise user input such as "560 001" or " 560001 " to "560001". */
export function normalisePincode(value: string): string {
  return value.replace(/\s+/g, "");
}

export const CITY_LAUNCH_STATUSES = ["HIDDEN", "COMING_SOON", "LIVE", "PAUSED"] as const;
export type CityLaunchStatus = (typeof CITY_LAUNCH_STATUSES)[number];

/** Is a 10-digit Indian mobile number (optionally prefixed with +91)? */
export function normaliseIndianMobile(value: string): string | null {
  const digits = value.replace(/[\s-]/g, "").replace(/^\+?91(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}
