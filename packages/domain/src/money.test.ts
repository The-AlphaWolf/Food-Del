import { describe, expect, it } from "vitest";
import {
  type FreshnessProfile,
  formatShelfLife,
  freshnessLabel,
  isPackagingCompatible,
  minResidualFloorHours,
  strictestTemp,
  validateFreshness,
} from "./catalog";
import { isValidPincode, normaliseIndianMobile, normalisePincode } from "./geo";
import { applyBps, ceilToRupee, formatINR, gstComponentOfInclusive, rupees } from "./money";

describe("money", () => {
  it("works in integer paise", () => {
    expect(rupees(649.5)).toBe(64950);
    expect(applyBps(10000, 2500)).toBe(2500);
    expect(ceilToRupee(12301)).toBe(12400);
    expect(ceilToRupee(12300)).toBe(12300);
  });

  it("extracts GST from inclusive prices", () => {
    // ₹105 inclusive of 5% GST contains ₹5 GST.
    expect(gstComponentOfInclusive(10500, 500)).toBe(500);
    expect(gstComponentOfInclusive(11800, 1800)).toBe(1800);
  });

  it("formats INR with Indian digit grouping", () => {
    expect(formatINR(12345600)).toBe("₹1,23,456");
    expect(formatINR(64950)).toBe("₹649.50");
  });
});

describe("catalog rules", () => {
  it("orders temperature classes", () => {
    expect(strictestTemp(["AMBIENT", "CHILLED", "AMBIENT"])).toBe("CHILLED");
    expect(strictestTemp([])).toBe("AMBIENT");
  });

  it("lets ambient goods ride chilled but never puts chilled goods on dry ice", () => {
    expect(isPackagingCompatible("CHILLED", "AMBIENT")).toBe(true);
    expect(isPackagingCompatible("FROZEN", "CHILLED")).toBe(false);
    expect(isPackagingCompatible("AMBIENT", "CHILLED")).toBe(false);
    expect(isPackagingCompatible("FROZEN", "AMBIENT")).toBe(false);
  });

  it("enforces the residual shelf-life floor", () => {
    expect(minResidualFloorHours(72)).toBe(22);
    const tooLow: FreshnessProfile = {
      tempClass: "CHILLED",
      shelfLifeHours: 72,
      minResidualHours: 10,
      madeToOrder: true,
      maxAgeAtDispatchHours: null,
    };
    expect(validateFreshness(tooLow)).toHaveLength(1);
    expect(validateFreshness({ ...tooLow, minResidualHours: 24 })).toEqual([]);
  });

  it("rejects stock that could never arrive fresh", () => {
    const stale: FreshnessProfile = {
      tempClass: "AMBIENT",
      shelfLifeHours: 240,
      minResidualHours: 72,
      madeToOrder: false,
      maxAgeAtDispatchHours: 200,
    };
    expect(validateFreshness(stale).join(" ")).toMatch(/never reach/);
  });

  it("labels freshness conservatively", () => {
    expect(formatShelfLife(36)).toBe("36 hours");
    expect(formatShelfLife(100)).toBe("4 days");
    expect(formatShelfLife(4320)).toBe("6 months");
    expect(freshnessLabel({ tempClass: "CHILLED", shelfLifeHours: 96 })).toBe(
      "Stays fresh 4 days · Chilled",
    );
  });
});

describe("geo", () => {
  it("validates and normalises pincodes and mobiles", () => {
    expect(isValidPincode("560001")).toBe(true);
    expect(isValidPincode("060001")).toBe(false);
    expect(normalisePincode(" 560 001 ")).toBe("560001");
    expect(normaliseIndianMobile("98765 43210")).toBe("+919876543210");
    expect(normaliseIndianMobile("+91-9876543210")).toBe("+919876543210");
    expect(normaliseIndianMobile("1234567890")).toBeNull();
  });
});
