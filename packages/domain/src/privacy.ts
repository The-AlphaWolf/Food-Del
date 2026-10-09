/**
 * DPDP Act 2023 rules that are pure data: which notice is current, how long we keep what, and
 * what an erased delivery address looks like.
 */

/** Bump when the privacy notice changes materially; people are asked to read it again. */
export const PRIVACY_NOTICE_VERSION = "2026-10-09";

/** How long each kind of personal data is kept once its purpose is served. */
export const RETENTION = {
  /** Message bodies (OTP-free order updates) for support questions. */
  notificationBodyDays: 180,
  /** Order and invoice records: GST law (CGST Act s.36) needs about six years; we keep eight. */
  taxRecordYears: 8,
} as const;

export const ERASED = "[erased]";

/**
 * A delivery address with the person removed: name, phone and street go; pincode, city and
 * state stay because GST place-of-supply and our delivery statistics need them.
 */
export function eraseShipTo<T extends { pincode: string; cityName: string; stateCode: string }>(
  shipTo: T,
): {
  recipientName: string;
  phone: string;
  line1: string;
  line2: null;
  landmark: null;
  pincode: string;
  cityName: string;
  stateCode: string;
} {
  return {
    recipientName: ERASED,
    phone: ERASED,
    line1: ERASED,
    line2: null,
    landmark: null,
    pincode: shipTo.pincode,
    cityName: shipTo.cityName,
    stateCode: shipTo.stateCode,
  };
}

/** "98450 12345" → "•••••• 2345", for records kept after their purpose is served. */
export function maskRecipient(recipient: string): string {
  if (recipient.includes("@")) {
    const [user, domain] = recipient.split("@");
    return `${user!.slice(0, 1)}•••@${domain}`;
  }
  const digits = recipient.replace(/\D/g, "");
  return digits.length >= 4 ? `••••••${digits.slice(-4)}` : ERASED;
}
