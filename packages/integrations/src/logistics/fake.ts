/**
 * A courier that lives in memory: AWBs are deterministic, labels point at our own dev label
 * endpoint, and tracking events are produced on demand (dev "advance" endpoint, e2e tests).
 */
import type { ShipmentStatus } from "@food-del/domain";
import type { BookedShipment, BookShipmentInput, CarrierEvent, CarrierProvider } from "./types";

export const FAKE_CARRIER_TOKEN = "fake-carrier-token";

let seq = 0;

export class FakeCarrier implements CarrierProvider {
  readonly name = "fake";
  readonly booked = new Map<string, BookShipmentInput>();
  readonly pickups: string[][] = [];

  constructor(private readonly labelBaseUrl = "/api/v1/dev/labels") {}

  async book(input: BookShipmentInput): Promise<BookedShipment> {
    const awbNumber = `FD${String(Date.now()).slice(-6)}${String(++seq).padStart(4, "0")}`;
    this.booked.set(awbNumber, input);
    return {
      awbNumber,
      carrierShipmentRef: `fake-${input.reference}`,
      labelUrl: `${this.labelBaseUrl}/${awbNumber}`,
      trackingUrl: null,
    };
  }

  async schedulePickup(refs: string[]): Promise<{ pickupRef: string | null }> {
    this.pickups.push(refs);
    return { pickupRef: `PU-${this.pickups.length}` };
  }

  async cancel(awbNumber: string): Promise<void> {
    this.booked.delete(awbNumber);
  }

  verifyWebhook(headers: Headers): boolean {
    return headers.get("x-api-key") === FAKE_CARRIER_TOKEN;
  }

  parseWebhook(rawBody: string): CarrierEvent[] {
    const parsed = JSON.parse(rawBody) as Array<
      Omit<CarrierEvent, "occurredAt" | "etaAt"> & {
        occurredAt: string;
        etaAt: string | null;
      }
    >;
    return parsed.map((e) => ({
      ...e,
      occurredAt: new Date(e.occurredAt),
      etaAt: e.etaAt ? new Date(e.etaAt) : null,
    }));
  }

  /** Build the webhook body a real carrier would send for a status change. */
  static event(
    awbNumber: string,
    status: ShipmentStatus,
    at = new Date(),
    etaAt: Date | null = null,
  ) {
    const event = {
      awbNumber,
      status,
      rawStatus: status,
      occurredAt: at.toISOString(),
      externalEventId: `${awbNumber}:${status}:${at.toISOString()}`,
      location: null,
      etaAt: etaAt?.toISOString() ?? null,
    };
    return JSON.stringify([event]);
  }
}
