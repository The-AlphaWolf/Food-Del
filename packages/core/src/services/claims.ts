import { schema } from "@food-del/db";
import { addHours } from "@food-del/domain";
import type { Claim, CreateClaimRequest, ResolveClaimRequest } from "@food-del/domain/contracts";
import { and, desc, eq } from "drizzle-orm";
import type { CoreDeps } from "../deps";
import { conflict, invalid, notFound } from "../errors";
import { iso } from "../mappers";
import { requireStaff, requireViewer, type Viewer } from "../viewer";
import { createRefund, shipmentChargePaise } from "./orders";
import { enqueue } from "./shipments";

const { claims, orders, shipments, vendorPayouts } = schema;

export class ClaimService {
  constructor(private readonly deps: CoreDeps) {}

  private toDto(c: typeof claims.$inferSelect, orderNumber: string): Claim {
    return {
      id: c.id,
      shipmentId: c.shipmentId,
      orderNumber,
      kind: c.kind,
      description: c.description,
      photoUrls: c.photoUrls,
      status: c.status,
      resolution: c.resolution,
      refundPaise: c.refundPaise,
      createdAt: iso(c.createdAt),
    };
  }

  /** Quality complaint, allowed until the claim window after delivery closes. */
  async create(
    viewerIn: Viewer | null,
    shipmentId: string,
    req: CreateClaimRequest,
  ): Promise<Claim> {
    const viewer = requireViewer(viewerIn);
    const now = this.deps.clock();
    const [row] = await this.deps.db
      .select({ s: shipments, o: orders })
      .from(shipments)
      .innerJoin(orders, eq(orders.id, shipments.orderId))
      .where(eq(shipments.id, shipmentId));
    if (!row || row.o.customerId !== viewer.userId) throw notFound("Parcel");
    if (row.s.status !== "DELIVERED" || !row.s.deliveredAt) {
      throw invalid("NOT_DELIVERED", "You can report a problem once the parcel is delivered.");
    }
    if (now > addHours(row.s.deliveredAt, this.deps.config.claimWindowHours)) {
      throw invalid(
        "CLAIM_WINDOW_CLOSED",
        `Problems must be reported within ${this.deps.config.claimWindowHours} hours of delivery.`,
      );
    }
    const [existing] = await this.deps.db
      .select()
      .from(claims)
      .where(and(eq(claims.shipmentId, shipmentId), eq(claims.status, "OPEN")));
    if (existing) throw conflict("CLAIM_EXISTS", "We're already looking into this parcel.");
    const [claim] = await this.deps.db
      .insert(claims)
      .values({
        shipmentId,
        customerId: viewer.userId,
        kind: req.kind,
        description: req.description,
        photoUrls: req.photoUrls ?? [],
      })
      .returning();
    return this.toDto(claim!, row.o.orderNumber);
  }

  async list(viewerIn: Viewer | null, status?: "OPEN" | "APPROVED" | "REJECTED"): Promise<Claim[]> {
    requireStaff(viewerIn);
    const rows = await this.deps.db
      .select({ c: claims, orderNumber: orders.orderNumber })
      .from(claims)
      .innerJoin(shipments, eq(shipments.id, claims.shipmentId))
      .innerJoin(orders, eq(orders.id, shipments.orderId))
      .where(status ? eq(claims.status, status) : undefined)
      .orderBy(desc(claims.createdAt))
      .limit(200);
    return rows.map((r) => this.toDto(r.c, r.orderNumber));
  }

  async resolve(
    viewerIn: Viewer | null,
    claimId: string,
    req: ResolveClaimRequest,
  ): Promise<Claim> {
    requireStaff(viewerIn);
    const now = this.deps.clock();
    return this.deps.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ c: claims, s: shipments, o: orders })
        .from(claims)
        .innerJoin(shipments, eq(shipments.id, claims.shipmentId))
        .innerJoin(orders, eq(orders.id, shipments.orderId))
        .where(eq(claims.id, claimId))
        .for("update", { of: claims });
      if (!row) throw notFound("Claim");
      if (row.c.status !== "OPEN")
        throw conflict("CLAIM_CLOSED", "This claim is already resolved.");

      let refundPaise = 0;
      if (req.decision === "APPROVED" && req.resolution === "REFUND") {
        refundPaise = Math.min(
          req.refundPaise ?? shipmentChargePaise(row.s),
          shipmentChargePaise(row.s),
        );
        await createRefund(tx, {
          orderId: row.o.id,
          shipmentId: row.s.id,
          amountPaise: refundPaise,
          reason: `Claim ${row.c.kind.toLowerCase()}`,
        });
        // The vendor isn't paid for food that arrived spoiled.
        await tx
          .update(vendorPayouts)
          .set({ status: "REVERSED" })
          .where(and(eq(vendorPayouts.shipmentId, row.s.id), eq(vendorPayouts.status, "ON_HOLD")));
      }
      const [claim] = await tx
        .update(claims)
        .set({
          status: req.decision,
          resolution: req.resolution,
          refundPaise,
          resolutionNote: req.note ?? null,
          resolvedAt: now,
        })
        .where(eq(claims.id, claimId))
        .returning();
      await enqueue(tx, {
        topic: "notify",
        payload: {
          template: "CLAIM_RESOLVED",
          orderId: row.o.id,
          shipmentId: row.s.id,
          extra: { decision: req.decision, refundPaise: String(refundPaise) },
        },
      });
      return this.toDto(claim!, row.o.orderNumber);
    });
  }
}
