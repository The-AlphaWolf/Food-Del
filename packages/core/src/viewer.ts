import type { Role } from "@food-del/domain/contracts";
import { forbidden, unauthenticated } from "./errors";

/** Who is making a request, resolved from their session. */
export interface Viewer {
  userId: string;
  roles: Role[];
  vendorIds: string[];
}

export function isStaff(v: Viewer | null): boolean {
  return Boolean(v && (v.roles.includes("OPS") || v.roles.includes("ADMIN")));
}

export function requireViewer(v: Viewer | null): Viewer {
  if (!v) throw unauthenticated();
  return v;
}

export function requireStaff(v: Viewer | null): Viewer {
  const viewer = requireViewer(v);
  if (!isStaff(viewer)) throw forbidden("This needs an operations account.");
  return viewer;
}

/** Vendor staff for this vendor, or ops. */
export function requireVendorAccess(v: Viewer | null, vendorId: string): Viewer {
  const viewer = requireViewer(v);
  if (isStaff(viewer) || viewer.vendorIds.includes(vendorId)) return viewer;
  throw forbidden("You don't manage this kitchen.");
}
