import { isTerminal, type ShipmentStatus } from "./shipment";

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "IN_FULFILLMENT",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  IN_FULFILLMENT: "Being prepared and shipped",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Payment not completed",
};

/**
 * An order's status is derived from its shipments; it is never set independently.
 *
 * @param wasPaid whether payment was ever captured for the order.
 */
export function deriveOrderStatus(
  shipments: readonly ShipmentStatus[],
  wasPaid: boolean,
): OrderStatus {
  if (shipments.length === 0) return wasPaid ? "CONFIRMED" : "PENDING_PAYMENT";
  if (shipments.every((s) => s === "PENDING_PAYMENT")) return "PENDING_PAYMENT";
  if (shipments.every((s) => s === "CANCELLED")) return wasPaid ? "CANCELLED" : "EXPIRED";
  if (shipments.every(isTerminal)) return "COMPLETED";
  if (shipments.every((s) => s === "PLACED" || s === "CANCELLED")) return "CONFIRMED";
  return "IN_FULFILLMENT";
}
