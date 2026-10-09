/**
 * Shiprocket aggregator: one API for Blue Dart, Delhivery and others. We book through it and let
 * our own serviceability engine decide feasibility (Shiprocket knows nothing about shelf life).
 */
import { timingSafeEqual } from "node:crypto";
import type { ShipmentStatus } from "@food-del/domain";
import { IntegrationError, requestJson } from "../http";
import type { BookedShipment, BookShipmentInput, CarrierEvent, CarrierProvider } from "./types";

export interface ShiprocketConfig {
  email: string;
  password: string;
  /** Token Shiprocket sends back in `x-api-key` on webhooks (set in the panel). */
  webhookToken: string;
  /** Our carrier code → Shiprocket courier_company_id. */
  courierIds: Record<string, number>;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/**
 * Shiprocket's `current_status` strings mapped onto our state machine. Anything not listed is
 * recorded but does not move the shipment.
 */
const STATUS_MAP: Record<string, ShipmentStatus> = {
  "PICKED UP": "PICKED_UP",
  SHIPPED: "IN_TRANSIT_INTERCITY",
  "IN TRANSIT": "IN_TRANSIT_INTERCITY",
  "IN TRANSIT-AT DESTINATION HUB": "AT_DESTINATION_HUB",
  "REACHED AT DESTINATION HUB": "AT_DESTINATION_HUB",
  "REACHED DESTINATION HUB": "AT_DESTINATION_HUB",
  "OUT FOR DELIVERY": "OUT_FOR_LOCAL_DELIVERY",
  DELIVERED: "DELIVERED",
  UNDELIVERED: "DELIVERY_ATTEMPT_FAILED",
  "UNDELIVERED-1ST ATTEMPT": "DELIVERY_ATTEMPT_FAILED",
  "UNDELIVERED-2ND ATTEMPT": "DELIVERY_ATTEMPT_FAILED",
  "UNDELIVERED-3RD ATTEMPT": "DELIVERY_ATTEMPT_FAILED",
};

const LOST_STATUSES = new Set(["LOST", "DESTROYED", "DAMAGED"]);

export function mapShiprocketStatus(raw: string): ShipmentStatus | null {
  return STATUS_MAP[raw.trim().toUpperCase()] ?? null;
}

/** Shiprocket timestamps look like "23 05 2026 11:43:52" or ISO; both are IST. */
export function parseShiprocketTime(value: string | undefined | null): Date | null {
  if (!value) return null;
  const dmy = /^(\d{2})[ -](\d{2})[ -](\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (dmy) {
    const [, d, m, y, hh, mm, ss] = dmy;
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss ?? "00"}+05:30`);
  }
  const ymd = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (ymd) {
    const [, y, m, d, hh, mm, ss] = ymd;
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss ?? "00"}+05:30`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

interface ShiprocketWebhook {
  awb: string | number;
  current_status: string;
  current_timestamp?: string;
  etd?: string;
  scans?: {
    date: string;
    status?: string;
    activity?: string;
    location?: string;
    "sr-status-label"?: string;
  }[];
}

export class ShiprocketProvider implements CarrierProvider {
  readonly name = "shiprocket";
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ShiprocketConfig) {
    this.base = config.baseUrl ?? "https://apiv2.shiprocket.in/v1/external";
    this.fetchImpl = config.fetch ?? fetch;
  }

  private async authToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const r = await requestJson<{ token: string }>(
      "shiprocket",
      `${this.base}/auth/login`,
      { body: { email: this.config.email, password: this.config.password } },
      this.fetchImpl,
    );
    // Tokens last 10 days; refresh a day early.
    this.token = { value: r.token, expiresAt: Date.now() + 9 * 86_400_000 };
    return r.token;
  }

  private async call<T>(path: string, body?: unknown): Promise<T> {
    const token = await this.authToken();
    return requestJson<T>(
      "shiprocket",
      `${this.base}${path}`,
      { body, headers: { Authorization: `Bearer ${token}` } },
      this.fetchImpl,
    );
  }

  async book(input: BookShipmentInput): Promise<BookedShipment> {
    const [first, ...rest] = input.drop.name.trim().split(/\s+/);
    const subTotal = input.items.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0) / 100;
    const created = await this.call<{ order_id: number; shipment_id: number }>(
      "/orders/create/adhoc",
      {
        order_id: input.reference,
        order_date: input.orderDate.toISOString().slice(0, 16).replace("T", " "),
        pickup_location: input.pickupLocation,
        comment: `Food-Del ${input.orderNumber}. Perishable — do not hold.`,
        billing_customer_name: first ?? input.drop.name,
        billing_last_name: rest.join(" ") || ".",
        billing_address: input.drop.line1,
        billing_address_2: [input.drop.line2, input.drop.landmark].filter(Boolean).join(", "),
        billing_city: input.drop.city,
        billing_pincode: input.drop.pincode,
        billing_state: input.drop.stateCode,
        billing_country: "India",
        billing_email: input.drop.email ?? "orders@food-del.in",
        billing_phone: input.drop.phone.replace(/^\+91/, ""),
        shipping_is_billing: true,
        order_items: input.items.map((i) => ({
          name: i.name,
          sku: i.sku,
          units: i.quantity,
          selling_price: i.unitPricePaise / 100,
          hsn: i.hsn,
        })),
        payment_method: "Prepaid",
        sub_total: subTotal,
        length: Math.ceil(input.parcel.lengthMm / 10),
        breadth: Math.ceil(input.parcel.breadthMm / 10),
        height: Math.ceil(input.parcel.heightMm / 10),
        weight: Math.max(0.5, input.parcel.deadWeightG / 1000),
      },
    );

    const courierId = this.config.courierIds[input.carrierCode];
    const awb = await this.call<{
      awb_assign_status: number;
      response?: { data?: { awb_code?: string } };
    }>("/courier/assign/awb", {
      shipment_id: created.shipment_id,
      ...(courierId ? { courier_id: courierId } : {}),
    });
    const awbNumber = awb.response?.data?.awb_code;
    if (!awbNumber) throw new IntegrationError("shiprocket", "no AWB assigned", undefined, awb);

    let labelUrl: string | null = null;
    try {
      const label = await this.call<{ label_url?: string }>("/courier/generate/label", {
        shipment_id: [created.shipment_id],
      });
      labelUrl = label.label_url ?? null;
    } catch {
      // Labels can be regenerated later from the vendor portal.
    }
    return {
      awbNumber,
      carrierShipmentRef: String(created.shipment_id),
      labelUrl,
      trackingUrl: `https://shiprocket.co/tracking/${awbNumber}`,
    };
  }

  async schedulePickup(carrierShipmentRefs: string[]): Promise<{ pickupRef: string | null }> {
    const r = await this.call<{ response?: { pickup_token_number?: string } }>(
      "/courier/generate/pickup",
      {
        shipment_id: carrierShipmentRefs.map(Number),
      },
    );
    return { pickupRef: r.response?.pickup_token_number ?? null };
  }

  async cancel(awbNumber: string): Promise<void> {
    await this.call("/orders/cancel/shipment/awbs", { awbs: [awbNumber] });
  }

  verifyWebhook(headers: Headers, _rawBody: string): boolean {
    const got = headers.get("x-api-key") ?? "";
    const want = this.config.webhookToken;
    return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
  }

  parseWebhook(rawBody: string): CarrierEvent[] {
    const body = JSON.parse(rawBody) as ShiprocketWebhook;
    const raw = String(body.current_status ?? "");
    const occurredAt = parseShiprocketTime(body.current_timestamp) ?? new Date();
    const awbNumber = String(body.awb);
    const lastScan = body.scans?.[body.scans.length - 1];
    return [
      {
        awbNumber,
        status: mapShiprocketStatus(raw),
        rawStatus: raw,
        occurredAt,
        externalEventId: `${awbNumber}:${raw}:${occurredAt.toISOString()}`,
        location: lastScan?.location ?? null,
        etaAt: parseShiprocketTime(body.etd),
        lost: LOST_STATUSES.has(raw.trim().toUpperCase()),
      },
    ];
  }
}
