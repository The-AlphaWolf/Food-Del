import { describe, expect, it } from "vitest";
import { rupees } from "../money";
import { chargeableWeightG, volumetricWeightG } from "../packaging";
import { RATE_CARDS } from "../testing/fixtures";
import {
  customerShippingFee,
  DEFAULT_FEE_POLICY,
  type FeePolicy,
  freightCostPaise,
  shippingSubsidy,
} from "./rates";

const air = RATE_CARDS[0]!;

describe("volumetric and chargeable weight", () => {
  it("bills an insulated box on volume, not dead weight", () => {
    // 30 × 25 × 20 cm = 15,000 cm³ ÷ 5000 = 3 kg.
    expect(volumetricWeightG([300, 250, 200], 5000)).toBe(3000);
    expect(chargeableWeightG(1200, [300, 250, 200], 5000)).toBe(3000);
    expect(chargeableWeightG(4200, [300, 250, 200], 5000)).toBe(4200);
  });
});

describe("freight cost", () => {
  it("charges the first slab, then additional slabs, plus fuel", () => {
    // 500 g: first slab only. ₹110 + 25% fuel.
    expect(freightCostPaise(air, 500, false)).toBe(rupees(137.5));
    // 1,200 g: first slab + 2 extra slabs = ₹290 + 25%.
    expect(freightCostPaise(air, 1200, false)).toBe(rupees(362.5));
  });

  it("adds the ODA surcharge after fuel", () => {
    expect(freightCostPaise(air, 500, true) - freightCostPaise(air, 500, false)).toBe(rupees(100));
  });
});

describe("customer fees", () => {
  it("marks up freight and rounds up to the rupee", () => {
    // ₹137.50 + 10% = ₹151.25 → ₹152.
    expect(customerShippingFee(rupees(137.5), DEFAULT_FEE_POLICY)).toBe(rupees(152));
  });

  it("subsidises shipping above the threshold, never below zero", () => {
    const festive: FeePolicy = {
      ...DEFAULT_FEE_POLICY,
      subsidyThresholdPaise: rupees(2000),
      shippingSubsidyPaise: rupees(150),
    };
    expect(shippingSubsidy(rupees(1999), rupees(300), festive)).toBe(0);
    expect(shippingSubsidy(rupees(2500), rupees(300), festive)).toBe(rupees(150));
    expect(shippingSubsidy(rupees(2500), rupees(99), festive)).toBe(rupees(99));
  });
});
