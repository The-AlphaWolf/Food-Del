import { addDays, istDateOf, type LocalDate } from "@food-del/domain";
import { sql } from "drizzle-orm";
import type { Executor } from "./client";

/**
 * Open daily inventory slots for every active variant on every day its vendor dispatches, from
 * `from` for `days` days. Existing slots (and their sales) are left untouched, so this is safe to
 * run nightly.
 */
export async function materializeInventorySlots(
  db: Executor,
  options: { from?: LocalDate; days: number; now?: Date },
): Promise<number> {
  const from = options.from ?? istDateOf(options.now ?? new Date());
  const to = addDays(from, options.days - 1);
  const rows = await db.execute(sql`
    insert into inventory_slots (variant_id, dispatch_date, capacity)
    select v.id, d::date, v.default_daily_cap
    from item_variants v
    join items i on i.id = v.item_id
    join vendors ven on ven.id = i.vendor_id
    cross join generate_series(${from}::date, ${to}::date, interval '1 day') as d
    where v.is_active
      and i.status = 'ACTIVE'
      and ven.status = 'ACTIVE'
      and (ven.dispatch_weekdays & (1 << (extract(isodow from d)::int - 1))) <> 0
    on conflict (variant_id, dispatch_date) do nothing
    returning id
  `);
  return rows.length;
}
