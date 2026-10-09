import { randomUUID } from "node:crypto";
import { schema } from "@food-del/db";
import { DEV_CUSTOMER, DEV_OPS } from "@food-del/db/seed";
import { atIst } from "@food-del/domain";
import type {
  CreateKitchenRequest,
  ItemInput,
  KitchenDetail,
  RouteInput,
} from "@food-del/domain/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DomainError } from "../src/errors";
import { createTestCore, type TestCore } from "../src/testing";
import type { Viewer } from "../src/viewer";

let t: TestCore;
let ops: Viewer;
let customer: Viewer;
let bengaluruId: string;
let jaipurId: string;
let kitchen: KitchenDetail;
let itemId: string;

const errorOf = (p: Promise<unknown>) => p.then(() => null).catch((e: DomainError) => e);

const kachori: ItemInput = {
  categoryId: "",
  name: "Mawa Kachori",
  shortDescription: "Flaky kachori stuffed with mawa and dry fruit, dipped in syrup.",
  description: "Jaipur's festive kachori, fried in ghee and soaked in light sugar syrup.",
  diet: "VEG",
  tempClass: "AMBIENT",
  shelfLifeHours: 120,
  minResidualHours: 48,
  madeToOrder: true,
  hsnCode: "2106",
  gstRateBps: 500,
  ingredients: "Refined flour, mawa (milk solids), ghee, sugar, cashew, almond, cardamom",
  allergens: ["Milk", "Tree nuts", "Gluten"],
  storage: "Store in a cool, dry place in the box it came in.",
  artKey: "pak",
  variants: [
    {
      label: "6 pieces",
      pricePaise: 48_000,
      netWeightG: 360,
      packedWeightG: 520,
      defaultDailyCap: 40,
    },
  ],
};

const newKitchen = (): CreateKitchenRequest => ({
  name: "Laxmi Misthan Bhandar",
  cityId: jaipurId,
  tagline: "Johari Bazaar's mithai house",
  establishedYear: 1727,
  pickupPincode: "302001",
  pickupAddress: {
    line1: "98-99, Johari Bazaar",
    contactName: "Dispatch desk",
    contactPhone: "98290 12345",
  },
  fssaiLicenseNo: "12219000000123",
  fssaiValidUntil: "2028-03-31",
  gstin: "08AABCL1234C1Z5",
  orderCutoffLocal: "17:00",
  prepLeadDays: 1,
  prepStartLocal: "05:00",
  readyForPickupLocal: "12:00",
  dispatchWeekdays: 63,
  dailyShipmentCap: 60,
  commissionBps: 1800,
  owner: { name: "Sunil Agarwal", phone: "9812345670" },
});

const airToBengaluru = (): RouteInput => ({
  originCityId: jaipurId,
  destinationCityId: bengaluruId,
  carrierCode: "bluedart",
  mode: "AIR_EXPRESS",
  transitHoursP50: 30,
  transitHoursP90: 42,
  pickupCutoffLocal: "15:00",
  deliversSunday: false,
  acceptsDryIce: false,
  rateZone: "METRO",
  isActive: true,
});

beforeAll(async () => {
  t = await createTestCore({ now: atIst("2026-10-12", "11:00") });
  ops = (await t.core.accounts.resolveViewer(DEV_OPS.id))!;
  customer = (await t.core.accounts.resolveViewer(DEV_CUSTOMER.id))!;
  const options = await t.core.onboarding.options(ops);
  bengaluruId = options.cities.find((c) => c.slug === "bengaluru")!.id;
  kachori.categoryId = options.categories.find((c) => c.slug === "mithai")!.id;
});

afterAll(async () => {
  await t?.close();
});

describe("onboarding a new city, kitchen and route", () => {
  it("is for operations staff only", async () => {
    expect((await errorOf(t.core.onboarding.options(customer)))?.code).toBe("FORBIDDEN");
  });

  it("lists the courier services we can price", async () => {
    const { carriers } = await t.core.onboarding.options(ops);
    expect(carriers.find((c) => c.code === "bluedart")?.modes).toEqual([
      { mode: "AIR_EXPRESS", zones: expect.arrayContaining(["METRO", "NEAR"]) },
    ]);
  });

  it("adds a city that claims its district's pincodes and starts hidden", async () => {
    const districts = await t.core.onboarding.directoryDistricts(ops, "RJ");
    expect(districts).toContainEqual({ district: "Jaipur", stateCode: "RJ", pincodes: 1 });

    jaipurId = await t.core.onboarding.createCity(ops, {
      name: "Jaipur",
      stateCode: "RJ",
      airportIata: "JAI",
      isOrigin: true,
      isDestination: true,
      districts: ["jaipur"],
    });
    const city = (await t.core.ops.cities(ops)).find((c) => c.id === jaipurId)!;
    expect(city).toMatchObject({ slug: "jaipur", launchStatus: "HIDDEN", pincodes: 1 });
    expect(await t.core.onboarding.directoryDistricts(ops, "RJ")).toEqual([]);
  });

  it("refuses a duplicate city, bad ranges and pincodes nobody can give it", async () => {
    const base = { stateCode: "RJ", isOrigin: false, isDestination: true, districts: [] };
    expect(
      (
        await errorOf(
          t.core.onboarding.createCity(ops, { ...base, name: "Jaipur", districts: ["Jaipur"] }),
        )
      )?.code,
    ).toBe("SLUG_TAKEN");
    expect(
      (
        await errorOf(
          t.core.onboarding.createCity(ops, { ...base, name: "Udaipur", pincodeRanges: "31300x" }),
        )
      )?.code,
    ).toBe("INVALID_PINCODES");
    // 560038 already belongs to Bengaluru.
    expect(
      (
        await errorOf(
          t.core.onboarding.createCity(ops, { ...base, name: "Udaipur", pincodeRanges: "560038" }),
        )
      )?.code,
    ).toBe("NO_PINCODES");
    expect((await t.core.ops.cities(ops)).some((c) => c.slug === "udaipur")).toBe(false);
  });

  it("creates a kitchen in onboarding with its owner invited", async () => {
    kitchen = await t.core.onboarding.createKitchen(ops, newKitchen());
    expect(kitchen).toMatchObject({
      slug: "laxmi-misthan-bhandar",
      status: "ONBOARDING",
      city: { slug: "jaipur" },
      orderCutoffLocal: "17:00",
      pickupAddress: { contactPhone: "+919829012345" },
      members: [{ name: "Sunil Agarwal", phone: "+919812345670", role: "VENDOR_OWNER" }],
      readyToGoLive: false,
    });
    expect(kitchen.readiness.filter((c) => !c.ok).map((c) => c.key)).toEqual([
      "SELLABLE_ITEM",
      "CITY_SHIPS_OUT",
      "PAYOUT_ACCOUNT",
    ]);
  });

  it("keeps the pickup inside the kitchen's city and slugs unique", async () => {
    const outside = await errorOf(
      t.core.onboarding.createKitchen(ops, {
        ...newKitchen(),
        name: "Other",
        pickupPincode: "560038",
      }),
    );
    expect(outside?.code).toBe("PICKUP_OUTSIDE_CITY");
    expect((await errorOf(t.core.onboarding.createKitchen(ops, newKitchen())))?.code).toBe(
      "SLUG_TAKEN",
    );
  });

  it("won't put the kitchen live while checks fail", async () => {
    const err = await errorOf(t.core.ops.updateVendor(ops, kitchen.id, { status: "ACTIVE" }));
    expect(err?.code).toBe("KITCHEN_NOT_READY");
    expect((err!.details as { key: string }[]).map((c) => c.key)).toEqual([
      "SELLABLE_ITEM",
      "CITY_SHIPS_OUT",
    ]);
  });

  it("adds a route to every pincode of the destination", async () => {
    const route = await t.core.onboarding.upsertRoute(ops, airToBengaluru());
    expect(route).toMatchObject({
      origin: { slug: "jaipur" },
      destination: { slug: "bengaluru" },
      transitHoursP90: 42,
      pickupCutoffLocal: "15:00",
      uniform: true,
      source: "MANUAL",
      isActive: true,
    });
    expect(route.pincodes).toBe(route.destinationPincodes);
    expect(route.pincodes).toBeGreaterThan(10);

    const paused = await t.core.onboarding.upsertRoute(ops, {
      ...airToBengaluru(),
      isActive: false,
    });
    expect(paused).toMatchObject({ isActive: false, activePincodes: 0, pincodes: route.pincodes });
    await t.core.onboarding.upsertRoute(ops, airToBengaluru());
    expect(await t.core.onboarding.routes(ops, { originCityId: jaipurId })).toHaveLength(1);
  });

  it("only saves routes it can price, between cities set up for them", async () => {
    const noRate = await errorOf(
      t.core.onboarding.upsertRoute(ops, { ...airToBengaluru(), rateZone: "MOON" }),
    );
    expect(noRate?.code).toBe("RATE_CARD_MISSING");
    const [chennai] = (await t.core.onboarding.options(ops)).cities.filter(
      (c) => c.slug === "chennai",
    );
    const notOrigin = await errorOf(
      t.core.onboarding.upsertRoute(ops, {
        ...airToBengaluru(),
        originCityId: chennai!.id,
        destinationCityId: jaipurId,
      }),
    );
    expect(notOrigin?.code).toBe("ORIGIN_NOT_ENABLED");
  });

  it("drafts a delicacy and previews where it can reach fresh", async () => {
    const item = await t.core.onboarding.createItem(ops, kitchen.id, kachori);
    itemId = item.id;
    expect(item).toMatchObject({
      slug: "mawa-kachori",
      status: "DRAFT",
      variants: [{ sku: "mawa-kachori-1", label: "6 pieces", isActive: true }],
    });
    expect((await errorOf(t.core.onboarding.createItem(ops, kitchen.id, kachori)))?.code).toBe(
      "SLUG_TAKEN",
    );

    const draft = {
      tempClass: "AMBIENT" as const,
      shelfLifeHours: 120,
      minResidualHours: 48,
      madeToOrder: true,
      packedWeightG: 520,
      pricePaise: 48_000,
      gstRateBps: 500,
    };
    const reach = await t.core.onboarding.reachPreview(ops, kitchen.id, draft);
    expect(reach.origin.slug).toBe("jaipur");
    const bengaluru = reach.destinations.find((d) => d.city.slug === "bengaluru")!;
    expect(bengaluru).toMatchObject({ ok: true, mode: "AIR_EXPRESS", carrierCode: "bluedart" });
    expect(bengaluru.shippingPaise).toBeGreaterThan(0);
    expect(reach.destinations.find((d) => d.city.slug === "mumbai")).toMatchObject({
      ok: false,
      reason: "NO_LANE",
    });

    // A one-day chilled sweet can't survive a 42-hour slow-day flight.
    const fragile = await t.core.onboarding.reachPreview(ops, kitchen.id, {
      ...draft,
      tempClass: "CHILLED",
      shelfLifeHours: 24,
      minResidualHours: 8,
    });
    expect(fragile.destinations.find((d) => d.city.slug === "bengaluru")?.ok).toBe(false);
  });

  it("puts the delicacy on sale and the kitchen live, opening the order book", async () => {
    await t.core.onboarding.setItemStatus(ops, itemId, { status: "ACTIVE" });
    const ready = await t.core.onboarding.kitchen(ops, kitchen.id);
    expect(ready.readyToGoLive).toBe(true);
    expect(ready.items).toMatchObject([{ name: "Mawa Kachori", status: "ACTIVE", variants: 1 }]);

    const [jaipurKitchen] = (
      await t.core.ops.updateVendor(ops, kitchen.id, { status: "ACTIVE" })
    ).filter((v) => v.id === kitchen.id);
    expect(jaipurKitchen?.status).toBe("ACTIVE");
    const slots = await t.handle.db
      .select()
      .from(schema.inventorySlots)
      .innerJoin(schema.itemVariants, eq(schema.itemVariants.id, schema.inventorySlots.variantId))
      .where(eq(schema.itemVariants.itemId, itemId));
    expect(slots.length).toBeGreaterThan(20);

    const listed = await t.core.catalog.getItem("mawa-kachori", "560038");
    expect(listed.delivery).toMatchObject({ available: true, mode: "AIR_EXPRESS" });
  });

  it("edits pack sizes without breaking order history", async () => {
    const before = await t.core.onboarding.item(ops, itemId);
    const edited = await t.core.onboarding.updateItem(ops, itemId, {
      ...kachori,
      name: "Mawa Kachori (Jaipur)",
      variants: [
        {
          label: "12 pieces",
          pricePaise: 92_000,
          netWeightG: 720,
          packedWeightG: 980,
          defaultDailyCap: 20,
        },
      ],
    });
    expect(edited.slug).toBe("mawa-kachori");
    expect(edited.variants).toMatchObject([
      { sku: "mawa-kachori-2", label: "12 pieces", isActive: true },
      { id: before.variants[0]!.id, isActive: false },
    ]);
    const err = await errorOf(t.core.onboarding.setItemStatus(ops, itemId, { status: "ACTIVE" }));
    expect(err).toBeNull();
  });

  it("refuses to sell a delicacy with no pack sizes on", async () => {
    const draft = await t.core.onboarding.createItem(ops, kitchen.id, {
      ...kachori,
      name: "Ghewar",
      variants: [{ ...kachori.variants[0]!, isActive: false }],
    });
    const err = await errorOf(t.core.onboarding.setItemStatus(ops, draft.id, { status: "ACTIVE" }));
    expect(err?.code).toBe("NO_ACTIVE_PACK");
  });

  it("hands an invitation to the owner's real account at first sign-in", async () => {
    await t.core.onboarding.addMember(ops, kitchen.id, {
      name: "Ravi",
      phone: "9812345671",
      role: "VENDOR_STAFF",
    });
    const supabaseId = randomUUID();
    await t.core.accounts.ensureProfile({ id: supabaseId, phone: "+919812345670" });
    const owner = await t.core.accounts.resolveViewer(supabaseId);
    expect(owner).toMatchObject({ vendorIds: [kitchen.id], roles: ["CUSTOMER", "VENDOR_OWNER"] });
    const detail = await t.core.onboarding.kitchen(ops, kitchen.id);
    expect(detail.members.map((m) => [m.userId === supabaseId, m.role])).toEqual([
      [true, "VENDOR_OWNER"],
      [false, "VENDOR_STAFF"],
    ]);
  });
});
