import type { Paise, ShipMode, ShipmentStatus } from "@food-del/domain";

export interface PartyAddress {
  name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  stateCode: string;
  pincode: string;
  email?: string | null;
}

export interface BookShipmentInput {
  /** Our shipment id; used as the carrier-side order reference. */
  reference: string;
  orderNumber: string;
  orderDate: Date;
  carrierCode: string;
  mode: ShipMode;
  /** Carrier-side pickup location nickname (configured per vendor). */
  pickupLocation: string;
  pickup: PartyAddress;
  drop: PartyAddress;
  parcel: {
    deadWeightG: number;
    lengthMm: number;
    breadthMm: number;
    heightMm: number;
    isDangerousGoods: boolean;
  };
  items: { name: string; sku: string; quantity: number; unitPricePaise: Paise; hsn: string }[];
  declaredValuePaise: Paise;
}

export interface BookedShipment {
  awbNumber: string;
  carrierShipmentRef: string;
  labelUrl: string | null;
  trackingUrl: string | null;
}

/** A tracking update normalised to our state machine. */
export interface CarrierEvent {
  awbNumber: string;
  /** Null when the carrier status has no equivalent (e.g. "manifest generated"). */
  status: ShipmentStatus | null;
  rawStatus: string;
  occurredAt: Date;
  /** Stable id for de-duplication; derived from the payload when the carrier gives none. */
  externalEventId: string;
  location: string | null;
  /** Carrier's latest estimated delivery time, if it sends one. */
  etaAt: Date | null;
  /** Carrier reports the parcel lost or destroyed. */
  lost?: boolean;
}

export interface CarrierProvider {
  readonly name: string;
  book(input: BookShipmentInput): Promise<BookedShipment>;
  schedulePickup(carrierShipmentRefs: string[]): Promise<{ pickupRef: string | null }>;
  cancel(awbNumber: string): Promise<void>;
  verifyWebhook(headers: Headers, rawBody: string): boolean;
  parseWebhook(rawBody: string): CarrierEvent[];
}
