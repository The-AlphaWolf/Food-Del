/**
 * Inventory primitives. Each is a single conditional UPDATE, so concurrent checkouts serialise on
 * the slot row: under READ COMMITTED a waiting transaction re-checks the WHERE clause against the
 * committed row, and the table's check constraint backs it up. Overselling is impossible.
 */
import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "./client";
import { inventorySlots } from "./schema";

/** Hold `qty` units for an unpaid order. False when the slot can't take them. */
export async function reserveUnits(db: Executor, slotId: string, qty: number): Promise<boolean> {
  const rows = await db
    .update(inventorySlots)
    .set({ reserved: sql`${inventorySlots.reserved} + ${qty}` })
    .where(
      and(
        eq(inventorySlots.id, slotId),
        sql`${inventorySlots.reserved} + ${inventorySlots.sold} + ${qty} <= ${inventorySlots.capacity}`,
      ),
    )
    .returning({ id: inventorySlots.id });
  return rows.length === 1;
}

/** Payment captured: held units become sold. */
export async function convertReservation(db: Executor, slotId: string, qty: number): Promise<void> {
  await db
    .update(inventorySlots)
    .set({
      reserved: sql`${inventorySlots.reserved} - ${qty}`,
      sold: sql`${inventorySlots.sold} + ${qty}`,
    })
    .where(eq(inventorySlots.id, slotId));
}

/** Payment never arrived: give the held units back. */
export async function releaseReservation(db: Executor, slotId: string, qty: number): Promise<void> {
  await db
    .update(inventorySlots)
    .set({ reserved: sql`${inventorySlots.reserved} - ${qty}` })
    .where(eq(inventorySlots.id, slotId));
}

/** A paid order was cancelled before cutoff: the units can be sold again. */
export async function releaseSold(db: Executor, slotId: string, qty: number): Promise<void> {
  await db
    .update(inventorySlots)
    .set({ sold: sql`${inventorySlots.sold} - ${qty}` })
    .where(eq(inventorySlots.id, slotId));
}
