/**
 * DPDP Act 2023 duties towards customers: a record of which privacy notice they saw, a copy of
 * everything we hold about them, and erasure on request. Order and payment records are kept for
 * tax law, with the person removed from them.
 */
import { type Executor, schema } from "@food-del/db";
import {
  ERASED,
  eraseShipTo,
  maskRecipient,
  PRIVACY_NOTICE_VERSION,
  RETENTION,
} from "@food-del/domain";
import type { DataExport } from "@food-del/domain/contracts";
import { and, asc, desc, eq, inArray, lt, ne, notInArray, or, sql } from "drizzle-orm";
import type { CoreDeps } from "../deps";
import { conflict, invalid, notFound } from "../errors";
import { isoOrNull } from "../mappers";
import { requireViewer, type Viewer } from "../viewer";

const {
  addresses,
  claims,
  memberships,
  notifications,
  orderItems,
  orders,
  payments,
  privacyEvents,
  profiles,
  shipments,
} = schema;

/** Orders that are finished one way or another; anything else is still in motion. */
const SETTLED_ORDER_STATUSES = ["COMPLETED", "CANCELLED", "EXPIRED"] as const;

export class PrivacyService {
  constructor(private readonly deps: CoreDeps) {}

  /** The notice version a person last acknowledged. */
  async acknowledgedVersion(userId: string, db: Executor = this.deps.db): Promise<string | null> {
    const [row] = await db
      .select({ v: privacyEvents.noticeVersion })
      .from(privacyEvents)
      .where(and(eq(privacyEvents.userId, userId), eq(privacyEvents.kind, "NOTICE_ACKNOWLEDGED")))
      .orderBy(desc(privacyEvents.at), desc(privacyEvents.id))
      .limit(1);
    return row?.v ?? null;
  }

  /** Record that the person was shown the current notice (at sign-in, or after it changed). */
  async acknowledgeNotice(viewerIn: Viewer | null, version: string): Promise<void> {
    const viewer = requireViewer(viewerIn);
    if (version !== PRIVACY_NOTICE_VERSION) {
      throw invalid("STALE_NOTICE", "Please reload the page to see the current privacy notice.");
    }
    if ((await this.acknowledgedVersion(viewer.userId)) === version) return;
    await this.deps.db.insert(privacyEvents).values({
      userId: viewer.userId,
      kind: "NOTICE_ACKNOWLEDGED",
      noticeVersion: version,
      at: this.deps.clock(),
    });
  }

  /** Everything we hold about the signed-in person. */
  async export(viewerIn: Viewer | null): Promise<DataExport> {
    const viewer = requireViewer(viewerIn);
    const db = this.deps.db;
    const now = this.deps.clock();
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, viewer.userId));
    if (!profile) throw notFound("Profile");

    const [addressRows, orderRows, claimRows] = await Promise.all([
      db
        .select()
        .from(addresses)
        .where(eq(addresses.userId, viewer.userId))
        .orderBy(asc(addresses.createdAt)),
      db
        .select()
        .from(orders)
        .where(eq(orders.customerId, viewer.userId))
        .orderBy(asc(orders.createdAt)),
      db
        .select({ claim: claims, orderNumber: orders.orderNumber })
        .from(claims)
        .innerJoin(shipments, eq(shipments.id, claims.shipmentId))
        .innerJoin(orders, eq(orders.id, shipments.orderId))
        .where(eq(claims.customerId, viewer.userId))
        .orderBy(asc(claims.createdAt)),
    ]);
    const orderIds = orderRows.map((o) => o.id);
    const recipients = [profile.phone, profile.email].filter((r): r is string => Boolean(r));
    const [itemRows, parcelRows, paymentRows, messageRows, events] = await Promise.all([
      orderIds.length
        ? db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
        : [],
      orderIds.length
        ? db
            .select()
            .from(shipments)
            .where(inArray(shipments.orderId, orderIds))
            .orderBy(asc(shipments.dispatchDate))
        : [],
      orderIds.length ? db.select().from(payments).where(inArray(payments.orderId, orderIds)) : [],
      orderIds.length || recipients.length
        ? db
            .select()
            .from(notifications)
            .where(
              or(
                orderIds.length ? inArray(notifications.orderId, orderIds) : sql`false`,
                recipients.length ? inArray(notifications.recipient, recipients) : sql`false`,
              ),
            )
            .orderBy(asc(notifications.sentAt))
        : [],
      db
        .select()
        .from(privacyEvents)
        .where(eq(privacyEvents.userId, viewer.userId))
        .orderBy(asc(privacyEvents.at), asc(privacyEvents.id)),
    ]);

    await db
      .insert(privacyEvents)
      .values({ userId: viewer.userId, kind: "DATA_EXPORTED", noticeVersion: null, at: now });

    return {
      generatedAt: now.toISOString(),
      about:
        "Everything Food-Del holds about you. Payment card or UPI details are held by Razorpay, not us. Questions: see food-del.in/privacy.",
      profile: {
        id: profile.id,
        phone: profile.phone,
        email: profile.email,
        fullName: profile.fullName,
        createdAt: profile.createdAt.toISOString(),
      },
      addresses: addressRows.map((a) => ({
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
      })),
      orders: orderRows.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        placedAt: isoOrNull(o.placedAt),
        shipTo: o.shipTo,
        gift: { message: o.giftMessage, senderName: o.senderName },
        grandTotalPaise: o.grandTotalPaise,
        items: itemRows
          .filter((i) => i.orderId === o.id)
          .map((i) => ({
            name: `${i.snapshot.itemName} (${i.snapshot.variantLabel})`,
            quantity: i.quantity,
            lineTotalPaise: i.quantity * i.unitPricePaise,
          })),
        parcels: parcelRows
          .filter((s) => s.orderId === o.id)
          .map((s) => ({
            status: s.status,
            dispatchDate: s.dispatchDate,
            awbNumber: s.awbNumber,
            deliveredAt: isoOrNull(s.deliveredAt),
          })),
        payments: paymentRows
          .filter((p) => p.orderId === o.id)
          .map((p) => ({
            status: p.status,
            amountPaise: p.amountPaise,
            method: p.method,
            capturedAt: isoOrNull(p.capturedAt),
          })),
      })),
      claims: claimRows.map(({ claim, orderNumber }) => ({
        orderNumber,
        kind: claim.kind,
        description: claim.description,
        status: claim.status,
        refundPaise: claim.refundPaise,
        createdAt: claim.createdAt.toISOString(),
      })),
      messages: messageRows.map((m) => ({
        channel: m.channel,
        recipient: m.recipient,
        template: m.template,
        body: m.body,
        sentAt: m.sentAt.toISOString(),
      })),
      privacyHistory: events.map((e) => ({
        kind: e.kind,
        noticeVersion: e.noticeVersion,
        at: e.at.toISOString(),
      })),
    };
  }

  /**
   * Erase the signed-in customer. Refused while an order or claim is still in motion (we'd lose
   * the means to deliver or refund it) and for kitchen or staff accounts, which ops close.
   */
  async deleteAccount(viewerIn: Viewer | null): Promise<{ ordersKeptForTax: number }> {
    const viewer = requireViewer(viewerIn);
    const now = this.deps.clock();
    return this.deps.db.transaction(async (tx) => {
      const [profile] = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.id, viewer.userId))
        .for("update");
      if (!profile || profile.deletedAt) throw notFound("Account");

      const [role] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(eq(memberships.userId, viewer.userId))
        .limit(1);
      if (role) {
        throw conflict(
          "ACCOUNT_HAS_ROLES",
          "This number runs a kitchen or works in operations. Ask ops to close the account so payouts and parcels are handed over first.",
        );
      }
      const active = await tx
        .select({ orderNumber: orders.orderNumber })
        .from(orders)
        .where(
          and(
            eq(orders.customerId, viewer.userId),
            notInArray(orders.status, [...SETTLED_ORDER_STATUSES]),
          ),
        );
      const openClaims = await tx
        .select({ id: claims.id })
        .from(claims)
        .where(and(eq(claims.customerId, viewer.userId), eq(claims.status, "OPEN")));
      if (active.length || openClaims.length) {
        throw conflict(
          "ACCOUNT_IN_USE",
          active.length
            ? `You have orders still in progress (${active.map((a) => a.orderNumber).join(", ")}). You can delete your account once they're delivered or cancelled.`
            : "You have a claim we're still looking into. You can delete your account once it's resolved.",
          { orders: active.map((a) => a.orderNumber), openClaims: openClaims.length },
        );
      }

      const mine = await tx
        .select({ id: orders.id, shipTo: orders.shipTo })
        .from(orders)
        .where(eq(orders.customerId, viewer.userId));
      for (const o of mine) {
        await tx
          .update(orders)
          .set({
            shipTo: eraseShipTo(o.shipTo),
            giftMessage: null,
            senderName: null,
            updatedAt: now,
          })
          .where(eq(orders.id, o.id));
      }
      await tx
        .update(claims)
        .set({ description: ERASED, photoUrls: [] })
        .where(eq(claims.customerId, viewer.userId));
      const recipients = [profile.phone, profile.email].filter((r): r is string => Boolean(r));
      const orderIds = mine.map((o) => o.id);
      if (orderIds.length || recipients.length) {
        await tx
          .update(notifications)
          .set({ recipient: ERASED, body: ERASED })
          .where(
            or(
              orderIds.length ? inArray(notifications.orderId, orderIds) : sql`false`,
              recipients.length ? inArray(notifications.recipient, recipients) : sql`false`,
            ),
          );
      }
      await tx.delete(addresses).where(eq(addresses.userId, viewer.userId));
      await tx
        .update(profiles)
        .set({ phone: null, email: null, fullName: null, deletedAt: now })
        .where(eq(profiles.id, viewer.userId));
      await tx
        .insert(privacyEvents)
        .values({ userId: viewer.userId, kind: "ACCOUNT_DELETED", noticeVersion: null, at: now });
      this.deps.logger.info("account erased", { userId: viewer.userId, orders: mine.length });
      return { ordersKeptForTax: mine.length };
    });
  }

  /**
   * Retention: message bodies are only needed for support questions about recent orders. After
   * that we keep the fact a message was sent (template, channel, time), not its contents.
   */
  async applyRetention(): Promise<number> {
    const cutoff = new Date(
      this.deps.clock().getTime() - RETENTION.notificationBodyDays * 86_400_000,
    );
    const old = await this.deps.db
      .select({ id: notifications.id, recipient: notifications.recipient })
      .from(notifications)
      .where(and(lt(notifications.sentAt, cutoff), ne(notifications.body, ERASED)))
      .limit(5000);
    for (const n of old) {
      await this.deps.db
        .update(notifications)
        .set({ body: ERASED, recipient: maskRecipient(n.recipient) })
        .where(eq(notifications.id, n.id));
    }
    return old.length;
  }
}
