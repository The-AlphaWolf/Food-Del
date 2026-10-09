import { schema } from "@food-del/db";
import { normaliseIndianMobile } from "@food-del/domain";
import type { Address, AddressInput, Me } from "@food-del/domain/contracts";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { CoreDeps } from "../deps";
import { invalid, notFound } from "../errors";
import { loadDestination } from "../planning";
import { requireViewer, type Viewer } from "../viewer";

const { addresses, memberships, profiles, vendors } = schema;

export class AccountService {
  constructor(private readonly deps: CoreDeps) {}

  /** Resolve roles and vendor scope for an authenticated user id. */
  async resolveViewer(userId: string): Promise<Viewer | null> {
    const [profile] = await this.deps.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, userId));
    if (!profile) return null;
    const rows = await this.deps.db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, userId));
    const roles = [...new Set(["CUSTOMER" as const, ...rows.map((r) => r.role)])];
    const vendorIds = rows.filter((r) => r.vendorId).map((r) => r.vendorId!);
    return { userId, roles, vendorIds };
  }

  /**
   * First request from a Supabase-authenticated user: make sure we have a profile for them.
   * The Supabase user id becomes our profile id.
   */
  async ensureProfile(input: {
    id: string;
    phone?: string | null;
    email?: string | null;
  }): Promise<void> {
    await this.deps.db
      .insert(profiles)
      .values({
        id: input.id,
        phone: input.phone ? normaliseIndianMobile(input.phone) : null,
        email: input.email ?? null,
      })
      .onConflictDoNothing({ target: profiles.id });
  }

  /** Development login: find or create the profile for a phone number. */
  async profileForPhone(phoneRaw: string): Promise<string> {
    const phone = normaliseIndianMobile(phoneRaw);
    if (!phone) throw invalid("INVALID_PHONE", "Enter a 10-digit Indian mobile number.");
    const [existing] = await this.deps.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.phone, phone));
    if (existing) return existing.id;
    const [created] = await this.deps.db
      .insert(profiles)
      .values({ phone })
      .onConflictDoNothing({ target: profiles.phone })
      .returning({ id: profiles.id });
    if (created) return created.id;
    const [again] = await this.deps.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.phone, phone));
    return again!.id;
  }

  async me(viewerIn: Viewer | null): Promise<Me> {
    const viewer = requireViewer(viewerIn);
    const [profile] = await this.deps.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, viewer.userId));
    if (!profile) throw notFound("Profile");
    const vendorRows = viewer.vendorIds.length
      ? await this.deps.db
          .select({ id: vendors.id, slug: vendors.slug, name: vendors.name })
          .from(vendors)
          .where(inArray(vendors.id, viewer.vendorIds))
          .orderBy(asc(vendors.name))
      : [];
    return {
      id: profile.id,
      phone: profile.phone,
      fullName: profile.fullName,
      email: profile.email,
      roles: viewer.roles,
      vendors: vendorRows,
    };
  }

  async updateMe(
    viewerIn: Viewer | null,
    patch: { fullName?: string; email?: string },
  ): Promise<Me> {
    const viewer = requireViewer(viewerIn);
    if (patch.fullName !== undefined || patch.email !== undefined) {
      await this.deps.db
        .update(profiles)
        .set({
          ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
          ...(patch.email !== undefined ? { email: patch.email } : {}),
        })
        .where(eq(profiles.id, viewer.userId));
    }
    return this.me(viewer);
  }

  private toAddress(a: typeof addresses.$inferSelect): Address {
    return {
      id: a.id,
      label: a.label,
      recipientName: a.recipientName,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2,
      landmark: a.landmark,
      pincode: a.pincode,
      cityName: a.cityName,
      stateCode: a.stateCode,
      isDefault: a.isDefault,
    };
  }

  async listAddresses(viewerIn: Viewer | null): Promise<Address[]> {
    const viewer = requireViewer(viewerIn);
    const rows = await this.deps.db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, viewer.userId))
      .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
    return rows.map((a) => this.toAddress(a));
  }

  async addAddress(viewerIn: Viewer | null, input: AddressInput): Promise<Address> {
    const viewer = requireViewer(viewerIn);
    const phone = normaliseIndianMobile(input.phone);
    if (!phone) throw invalid("INVALID_PHONE", "Enter a 10-digit Indian mobile number.");
    const dest = await loadDestination(this.deps.db, input.pincode);
    if (!dest) throw invalid("UNKNOWN_PINCODE", "We couldn't find that pincode.");
    return this.deps.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: addresses.id })
        .from(addresses)
        .where(eq(addresses.userId, viewer.userId));
      const makeDefault = input.isDefault ?? existing.length === 0;
      if (makeDefault) {
        await tx
          .update(addresses)
          .set({ isDefault: false })
          .where(eq(addresses.userId, viewer.userId));
      }
      const [row] = await tx
        .insert(addresses)
        .values({
          userId: viewer.userId,
          label: input.label ?? null,
          recipientName: input.recipientName,
          phone,
          line1: input.line1,
          line2: input.line2 ?? null,
          landmark: input.landmark ?? null,
          pincode: input.pincode,
          cityName: dest.city?.name ?? dest.district,
          stateCode: dest.stateCode,
          isDefault: makeDefault,
        })
        .returning();
      return this.toAddress(row!);
    });
  }

  async deleteAddress(viewerIn: Viewer | null, id: string): Promise<void> {
    const viewer = requireViewer(viewerIn);
    const deleted = await this.deps.db
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, viewer.userId)))
      .returning({ id: addresses.id });
    if (deleted.length === 0) throw notFound("Address");
  }
}
