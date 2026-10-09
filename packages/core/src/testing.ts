/**
 * A fully wired core against the test database, with fake providers and a controllable clock.
 */
import type { DbHandle } from "@food-del/db";
import { createSeededTestDb } from "@food-del/db/testing";
import { FakeCarrier, FakePaymentProvider, RecordingNotifier } from "@food-del/integrations";
import { type Core, createCore } from "./core";
import { type CoreConfig, DEFAULT_CONFIG, silentLogger } from "./deps";

export interface TestCore {
  core: Core;
  handle: DbHandle;
  clock: { now: Date; set(d: Date): void; advanceHours(h: number): void };
  payments: FakePaymentProvider;
  carrier: FakeCarrier;
  notifier: RecordingNotifier;
  close(): Promise<void>;
}

export async function createTestCore(options: {
  now: Date;
  config?: Partial<CoreConfig>;
}): Promise<TestCore> {
  const handle = await createSeededTestDb({ today: options.now, slotDays: 30 }, { max: 20 });
  const clock = {
    now: options.now,
    set(d: Date) {
      clock.now = d;
    },
    advanceHours(h: number) {
      clock.now = new Date(clock.now.getTime() + h * 3_600_000);
    },
  };
  const payments = new FakePaymentProvider();
  const carrier = new FakeCarrier();
  const notifier = new RecordingNotifier();
  const core = createCore({
    db: handle.db,
    clock: () => clock.now,
    payments,
    carrier,
    notifier,
    config: { ...DEFAULT_CONFIG, opsPhone: "+919900000002", ...options.config },
    logger: silentLogger,
  });
  return { core, handle, clock, payments, carrier, notifier, close: () => handle.close() };
}
