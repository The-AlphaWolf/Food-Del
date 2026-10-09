/**
 * Development and demo accounts with fixed ids, so dev login, e2e tests and the seed agree.
 * Never seeded outside development (see `seed()`).
 */
export const DEV_CUSTOMER = {
  id: "11111111-1111-4111-8111-111111111111",
  phone: "+919900000001",
  fullName: "Ananya Rao",
  email: "ananya@example.com",
} as const;

export const DEV_OPS = {
  id: "22222222-2222-4222-8222-222222222222",
  phone: "+919900000002",
  fullName: "Ops Desk",
  email: "ops@example.com",
} as const;

/** Vendor owner accounts: `+9199000001NN`, one per seeded vendor in order. */
export function devVendorOwner(index: number, vendorSlug: string) {
  const n = String(index + 1).padStart(2, "0");
  return {
    id: `33333333-3333-4333-8333-0000000000${n}`,
    phone: `+9199000001${n}`,
    fullName: `Owner, ${vendorSlug}`,
    email: `${vendorSlug}@example.com`,
  };
}
