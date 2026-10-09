import type { Database } from "@food-del/db";
import { DEFAULT_FEE_POLICY, type PlanningPolicy } from "@food-del/domain";
import type { CarrierProvider, Notifier, PaymentProvider } from "@food-del/integrations";

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export const consoleLogger: Logger = {
  info: (msg, data) => console.info(JSON.stringify({ level: "info", msg, ...data })),
  warn: (msg, data) => console.warn(JSON.stringify({ level: "warn", msg, ...data })),
  error: (msg, data) => console.error(JSON.stringify({ level: "error", msg, ...data })),
};

export const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

export interface CoreConfig {
  brandName: string;
  /** Public URL of the web app, for links in messages. */
  appUrl: string;
  /** How long an unpaid checkout holds inventory. */
  holdMinutes: number;
  /** Customers may raise a quality claim this long after delivery; vendor payouts wait for it. */
  claimWindowHours: number;
  /** Days shown in the delivery-date picker. */
  calendarDays: number;
  planning: PlanningPolicy;
  /** Where at-risk and exception alerts go. */
  opsPhone: string | null;
  opsEmail: string | null;
  /** Carrier-side pickup location nickname for a vendor (configured in the carrier panel). */
  pickupLocationFor(vendorSlug: string): string;
}

export const DEFAULT_CONFIG: CoreConfig = {
  brandName: "Food-Del",
  appUrl: "http://localhost:3000",
  holdMinutes: 15,
  claimWindowHours: 24,
  calendarDays: 21,
  planning: {
    horizonDays: 21,
    handlingBufferHours: 6,
    odaExtraHours: 24,
    fees: DEFAULT_FEE_POLICY,
  },
  opsPhone: null,
  opsEmail: null,
  pickupLocationFor: (slug) => slug,
};

export interface CoreDeps {
  db: Database;
  clock: () => Date;
  payments: PaymentProvider;
  carrier: CarrierProvider;
  notifier: Notifier;
  config: CoreConfig;
  logger: Logger;
}
