import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "../src/client";
import { isCheckViolation } from "../src/errors";
import { cities, items, pincodes, serviceabilityMatrix } from "../src/schema";
import { DEV_CUSTOMER } from "../src/seed";
import { createSeededTestDb } from "../src/testing";

let h: DbHandle;

beforeAll(async () => {
  h = await createSeededTestDb({ today: new Date("2026-10-12T05:30:00Z"), slotDays: 7 });
});

afterAll(async () => {
  await h?.close();
});

describe("seed", () => {
  it("loads the confirmed launch footprint", async () => {
    const all = await h.db.select().from(cities);
    expect(
      all
        .filter((c) => c.isOrigin)
        .map((c) => c.slug)
        .sort(),
    ).toEqual(["bengaluru", "delhi-ncr", "hyderabad", "kolkata"]);
    expect(all.filter((c) => c.isDestination)).toHaveLength(7);
  });

  it("never creates same-city lanes", async () => {
    const rows = await h.db.execute(sql`
      select count(*)::int as n from serviceability_matrix s
      join pincodes p on p.pincode = s.dest_pincode
      where p.city_id = s.origin_city_id`);
    expect(rows[0]!.n).toBe(0);
  });

  it("routes NCR satellite pincodes to Delhi NCR", async () => {
    const [gurugram] = await h.db
      .select()
      .from(pincodes)
      .where(sql`${pincodes.pincode} = '122001'`);
    const [ncr] = await h.db.select().from(cities).where(sql`${cities.slug} = 'delhi-ncr'`);
    expect(gurugram!.cityId).toBe(ncr!.id);
    expect(gurugram!.stateCode).toBe("HR");
  });

  it("has two services for every lane", async () => {
    const rows = await h.db.execute(sql`
      select count(*)::int as n from (
        select origin_city_id, dest_pincode from serviceability_matrix
        group by 1, 2 having count(*) <> 2
      ) x`);
    expect(rows[0]!.n).toBe(0);
    const lanes = await h.db.select().from(serviceabilityMatrix).limit(5);
    for (const l of lanes) expect(l.transitHoursP90).toBeGreaterThanOrEqual(l.transitHoursP50);
  });

  it("does not open slots on days vendors don't dispatch", async () => {
    const rows = await h.db.execute(sql`
      select count(*)::int as n from inventory_slots s
      join item_variants v on v.id = s.variant_id
      join items i on i.id = v.item_id
      join vendors ven on ven.id = i.vendor_id
      where (ven.dispatch_weekdays & (1 << (extract(isodow from s.dispatch_date)::int - 1))) = 0`);
    expect(rows[0]!.n).toBe(0);
  });

  it("is idempotent", async () => {
    const { seed } = await import("../src/seed");
    expect(await seed(h.db, { today: new Date() })).toMatchObject({ skipped: true });
  });
});

describe("constraints", () => {
  it("rejects malformed pincodes", async () => {
    const err = await h.db
      .insert(pincodes)
      .values({ pincode: "012345", district: "x", stateCode: "XX" })
      .catch((e: unknown) => e);
    expect(isCheckViolation(err, "pincodes_format")).toBe(true);
  });

  it("rejects residual shelf life at or above shelf life", async () => {
    const err = await h.db
      .execute(sql`update ${items} set min_residual_hours = shelf_life_hours`)
      .catch((e: unknown) => e);
    expect(isCheckViolation(err, "items_residual")).toBe(true);
  });
});

describe("row-level security", () => {
  async function asRole<T>(
    role: "anon" | "authenticated",
    sub: string | null,
    q: string,
  ): Promise<T[]> {
    return h.db.transaction(async (tx) => {
      await tx.execute(sql.raw(`set local role ${role}`));
      if (sub) await tx.execute(sql`select set_config('request.jwt.claim.sub', ${sub}, true)`);
      return (await tx.execute(sql.raw(q))) as unknown as T[];
    });
  }

  it("lets anyone browse the catalogue", async () => {
    const rows = await asRole<{ n: number }>("anon", null, "select count(*)::int as n from items");
    expect(rows[0]!.n).toBe(29);
  });

  it("hides operational tables from the public", async () => {
    const lanes = await asRole<{ n: number }>(
      "anon",
      null,
      "select count(*)::int as n from serviceability_matrix",
    );
    expect(lanes[0]!.n).toBe(0);
    const orders = await asRole<{ n: number }>(
      "anon",
      null,
      "select count(*)::int as n from orders",
    );
    expect(orders[0]!.n).toBe(0);
  });

  it("shows a signed-in customer only their own profile", async () => {
    const rows = await asRole<{ id: string }>(
      "authenticated",
      DEV_CUSTOMER.id,
      "select id from profiles",
    );
    expect(rows.map((r) => r.id)).toEqual([DEV_CUSTOMER.id]);
  });
});
