import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "../src/client";
import { isCheckViolation } from "../src/errors";
import {
  convertReservation,
  releaseReservation,
  releaseSold,
  reserveUnits,
} from "../src/inventory";
import { inventorySlots } from "../src/schema";
import { createSeededTestDb } from "../src/testing";

let h: DbHandle;
let slotId: string;

beforeAll(async () => {
  h = await createSeededTestDb(
    { today: new Date("2026-10-12T05:30:00Z"), slotDays: 3 },
    { max: 60 },
  );
  const [slot] = await h.db.select().from(inventorySlots).limit(1);
  slotId = slot!.id;
});

afterAll(async () => {
  await h?.close();
});

async function setSlot(capacity: number, reserved = 0, sold = 0) {
  await h.db
    .update(inventorySlots)
    .set({ capacity, reserved, sold })
    .where(eq(inventorySlots.id, slotId));
}

async function readSlot() {
  const [s] = await h.db.select().from(inventorySlots).where(eq(inventorySlots.id, slotId));
  return s!;
}

describe("inventory reservations", () => {
  it("never oversells under 50 concurrent checkouts", async () => {
    await setSlot(20);
    const results = await Promise.all(
      Array.from({ length: 50 }, () => h.db.transaction((tx) => reserveUnits(tx, slotId, 1))),
    );
    expect(results.filter(Boolean)).toHaveLength(20);
    const s = await readSlot();
    expect(s.reserved).toBe(20);
    expect(s.sold).toBe(0);
  });

  it("handles mixed quantities without exceeding capacity", async () => {
    await setSlot(25);
    const quantities = Array.from({ length: 40 }, (_, i) => (i % 4) + 1);
    const results = await Promise.all(
      quantities.map((q) => h.db.transaction((tx) => reserveUnits(tx, slotId, q))),
    );
    const granted = quantities.filter((_, i) => results[i]).reduce((a, b) => a + b, 0);
    const s = await readSlot();
    expect(s.reserved).toBe(granted);
    expect(granted).toBeLessThanOrEqual(25);
    // Greedy packing leaves at most 3 units stranded (the largest request that didn't fit).
    expect(granted).toBeGreaterThanOrEqual(22);
  });

  it("moves units between reserved and sold, and back", async () => {
    await setSlot(10);
    expect(await reserveUnits(h.db, slotId, 4)).toBe(true);
    await convertReservation(h.db, slotId, 3);
    await releaseReservation(h.db, slotId, 1);
    expect(await readSlot()).toMatchObject({ reserved: 0, sold: 3 });
    await releaseSold(h.db, slotId, 3);
    expect(await readSlot()).toMatchObject({ reserved: 0, sold: 0 });
  });

  it("is backed by a check constraint", async () => {
    await setSlot(5, 0, 5);
    const err = await h.db
      .execute(sql`update inventory_slots set sold = sold + 1 where id = ${slotId}`)
      .catch((e: unknown) => e);
    expect(isCheckViolation(err, "inventory_slots_no_oversell")).toBe(true);
  });
});
