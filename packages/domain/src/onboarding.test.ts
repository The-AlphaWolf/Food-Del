import { describe, expect, it } from "vitest";
import {
  assessKitchenReadiness,
  describeWeekdays,
  GSTIN_RE,
  isReadyToGoLive,
  type KitchenFacts,
  parsePincodeRanges,
  slugify,
} from "./onboarding";

describe("slugify", () => {
  it("makes stable URL slugs from kitchen and sweet names", () => {
    expect(slugify("Bagbazar Mishti Ghar")).toBe("bagbazar-mishti-ghar");
    expect(slugify("Chandni Chowk Halwai & Sons")).toBe("chandni-chowk-halwai-and-sons");
    expect(slugify("  Kājū Katlī (500 g)!  ")).toBe("kaju-katli-500-g");
    expect(slugify("---")).toBe("");
  });
});

describe("describeWeekdays", () => {
  it("reads like a shop sign", () => {
    expect(describeWeekdays(63)).toBe("Mon–Sat");
    expect(describeWeekdays(127)).toBe("Every day");
    expect(describeWeekdays(0b0010101)).toBe("Mon, Wed, Fri");
    expect(describeWeekdays(0)).toBe("No dispatch days");
  });
});

describe("GSTIN format", () => {
  it("accepts a well-formed GSTIN and rejects lowercase or short ones", () => {
    expect(GSTIN_RE.test("19AABCB1234C1Z5")).toBe(true);
    expect(GSTIN_RE.test("19aabcb1234c1z5")).toBe(false);
    expect(GSTIN_RE.test("19AABCB1234C1Z")).toBe(false);
  });
});

describe("kitchen readiness", () => {
  const ready: KitchenFacts = {
    fssaiValidUntil: "2027-03-31",
    today: "2026-10-12",
    owners: 1,
    sellableItems: 3,
    cityIsOrigin: true,
    routesFromCity: 12,
    dispatchWeekdays: 63,
    payoutAccountLinked: false,
  };

  it("lets a kitchen go live without a payout account (payouts wait)", () => {
    const checks = assessKitchenReadiness(ready);
    expect(isReadyToGoLive(checks)).toBe(true);
    expect(checks.find((c) => c.key === "PAYOUT_ACCOUNT")).toMatchObject({
      ok: false,
      blocking: false,
    });
  });

  it.each([
    [{ fssaiValidUntil: "2026-10-30" }, "FSSAI_VALID"],
    [{ fssaiValidUntil: "2026-10-01" }, "FSSAI_VALID"],
    [{ owners: 0 }, "OWNER_ACCOUNT"],
    [{ sellableItems: 0 }, "SELLABLE_ITEM"],
    [{ cityIsOrigin: false }, "CITY_SHIPS_OUT"],
    [{ routesFromCity: 0 }, "CITY_SHIPS_OUT"],
    [{ dispatchWeekdays: 0 }, "DISPATCH_DAYS"],
  ] as const)("blocks go-live when %o", (patch, key) => {
    const checks = assessKitchenReadiness({ ...ready, ...patch });
    expect(isReadyToGoLive(checks)).toBe(false);
    expect(checks.filter((c) => !c.ok && c.blocking).map((c) => c.key)).toEqual([key]);
  });
});

describe("parsePincodeRanges", () => {
  it("reads single pincodes and ranges", () => {
    expect(parsePincodeRanges("302001-302039, 302044")).toEqual([
      { from: 302001, to: 302039 },
      { from: 302044, to: 302044 },
    ]);
  });

  it("rejects malformed, reversed and huge ranges", () => {
    expect(parsePincodeRanges("")).toBeNull();
    expect(parsePincodeRanges("02001")).toBeNull();
    expect(parsePincodeRanges("302039-302001")).toBeNull();
    expect(parsePincodeRanges("100000-199999")).toBeNull();
  });
});
