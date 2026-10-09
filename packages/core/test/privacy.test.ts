import { schema } from "@food-del/db";
import { DEV_OPS } from "@food-del/db/seed";
import { ERASED, PRIVACY_NOTICE_VERSION } from "@food-del/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DomainError } from "../src/errors";
import { createTestCore, type TestCore } from "../src/testing";
import type { Viewer } from "../src/viewer";

let t: TestCore;
let customer: Viewer;
let customerId: string;
let orderId: string;
const PHONE = "9822233344";

const errorOf = (p: Promise<unknown>) => p.then(() => null).catch((e: DomainError) => e);

beforeAll(async () => {
  t = await createTestCore({ now: new Date("2026-10-12T05:30:00Z") });
  customerId = await t.core.accounts.profileForPhone(PHONE);
  customer = (await t.core.accounts.resolveViewer(customerId))!;
});
afterAll(async () => {
  await t?.close();
});

describe("privacy notice", () => {
  it("records which version a person has seen, once", async () => {
    expect((await t.core.accounts.me(customer)).privacyNoticeAcknowledged).toBeNull();
    const stale = await errorOf(t.core.privacy.acknowledgeNotice(customer, "2020-01-01"));
    expect(stale?.code).toBe("STALE_NOTICE");
    await t.core.privacy.acknowledgeNotice(customer, PRIVACY_NOTICE_VERSION);
    await t.core.privacy.acknowledgeNotice(customer, PRIVACY_NOTICE_VERSION);
    expect((await t.core.accounts.me(customer)).privacyNoticeAcknowledged).toBe(
      PRIVACY_NOTICE_VERSION,
    );
    const events = await t.handle.db
      .select()
      .from(schema.privacyEvents)
      .where(eq(schema.privacyEvents.userId, customerId));
    expect(events.map((e) => e.kind)).toEqual(["NOTICE_ACKNOWLEDGED"]);
  });
});

describe("export and erasure", () => {
  it("exports everything held about the person", async () => {
    await t.core.accounts.updateMe(customer, {
      fullName: "Meera Pillai",
      email: "meera@example.com",
    });
    await t.core.accounts.addAddress(customer, {
      recipientName: "Meera Pillai",
      phone: PHONE,
      line1: "7, Palace Road",
      pincode: "560038",
    });
    const katli = await t.core.catalog.getItem("kaju-katli");
    const placed = await t.core.orders.place(customer, {
      pincode: "560038",
      shipTo: { recipientName: "Arjun Pillai", phone: "9811100022", line1: "9, Church Street" },
      lines: [{ variantId: katli.variants[0]!.id, quantity: 1 }],
      gift: { message: "Happy Diwali, Arjun!", senderName: "Meera" },
    });
    orderId = placed.order.id;
    await t.handle.db.insert(schema.notifications).values({
      orderId,
      channel: "SMS",
      recipient: `+91${PHONE}`,
      template: "ORDER_PLACED",
      body: "Your order is placed",
      sentAt: t.clock.now,
    });

    const data = await t.core.privacy.export(customer);
    expect(data.profile).toMatchObject({ fullName: "Meera Pillai", email: "meera@example.com" });
    expect(data.addresses).toHaveLength(1);
    expect(data.orders).toHaveLength(1);
    expect(data.orders[0]).toMatchObject({
      orderNumber: placed.order.orderNumber,
      shipTo: { recipientName: "Arjun Pillai", line1: "9, Church Street" },
      gift: { message: "Happy Diwali, Arjun!", senderName: "Meera" },
    });
    expect(data.orders[0]!.items[0]!.name).toContain("Kaju");
    expect(data.orders[0]!.parcels.length).toBeGreaterThan(0);
    expect(data.messages.map((m) => m.body)).toEqual(["Your order is placed"]);
    expect(data.privacyHistory.map((e) => e.kind)).toEqual(["NOTICE_ACKNOWLEDGED"]);
    expect((await t.core.privacy.export(customer)).privacyHistory.at(-1)?.kind).toBe(
      "DATA_EXPORTED",
    );
  });

  it("won't erase while an order is still in progress", async () => {
    const e = await errorOf(t.core.privacy.deleteAccount(customer));
    expect(e).toMatchObject({ code: "ACCOUNT_IN_USE", status: 409 });
    expect(e?.message).toContain("in progress");
  });

  it("won't erase kitchen or staff accounts", async () => {
    const ops = (await t.core.accounts.resolveViewer(DEV_OPS.id))!;
    expect((await errorOf(t.core.privacy.deleteAccount(ops)))?.code).toBe("ACCOUNT_HAS_ROLES");
  });

  it("erases the person but keeps the tax record", async () => {
    // The unpaid order lapses, so nothing is in progress any more.
    t.clock.advanceHours(2);
    await t.core.runJob("expire-holds");
    const r = await t.core.privacy.deleteAccount(customer);
    expect(r.ordersKeptForTax).toBe(1);

    expect(await t.core.accounts.resolveViewer(customerId)).toBeNull();
    const [profile] = await t.handle.db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, customerId));
    expect(profile).toMatchObject({ phone: null, email: null, fullName: null });
    expect(profile!.deletedAt).not.toBeNull();
    expect(
      await t.handle.db
        .select()
        .from(schema.addresses)
        .where(eq(schema.addresses.userId, customerId)),
    ).toEqual([]);

    const [order] = await t.handle.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));
    expect(order!.shipTo).toMatchObject({
      recipientName: ERASED,
      phone: ERASED,
      line1: ERASED,
      pincode: "560038",
      stateCode: "KA",
    });
    expect(order!.giftMessage).toBeNull();
    expect(order!.senderName).toBeNull();
    expect(order!.grandTotalPaise).toBeGreaterThan(0);

    const messages = await t.handle.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.orderId, orderId));
    expect(messages.every((m) => m.body === ERASED && m.recipient === ERASED)).toBe(true);

    const events = await t.handle.db
      .select()
      .from(schema.privacyEvents)
      .where(eq(schema.privacyEvents.userId, customerId));
    expect(events.at(-1)?.kind).toBe("ACCOUNT_DELETED");

    // The same number can sign up again, as somebody new.
    const again = await t.core.accounts.profileForPhone(PHONE);
    expect(again).not.toBe(customerId);
  });
});

describe("retention", () => {
  it("drops old message text but keeps the fact it was sent", async () => {
    const [old] = await t.handle.db
      .insert(schema.notifications)
      .values({
        channel: "WHATSAPP",
        recipient: "+919812345678",
        template: "DELIVERED",
        body: "Delivered to Ravi",
        sentAt: new Date(t.clock.now.getTime() - 200 * 86_400_000),
      })
      .returning();
    await t.core.runJob("housekeeping");
    const [after] = await t.handle.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, old!.id));
    expect(after).toMatchObject({ body: ERASED, recipient: "••••••5678", template: "DELIVERED" });
  });
});
