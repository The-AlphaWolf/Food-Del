import { describe, expect, it } from "vitest";
import { formatDateTime, formatINRCompact, relativeHours } from "./format";

describe("formatDateTime", () => {
  it("shows the time in IST whatever the server's zone", () => {
    expect(formatDateTime("2026-10-12T12:30:00.000Z")).toBe("Mon, 12 Oct, 6:00 pm");
  });
});

describe("relativeHours", () => {
  const now = Date.parse("2026-10-12T05:30:00.000Z");
  const at = (h: number) => new Date(now + h * 3_600_000).toISOString();

  it("uses minutes, hours or days by distance", () => {
    expect(relativeHours(at(0.25), now)).toBe("in 15 min");
    expect(relativeHours(at(3), now)).toBe("in 3 h");
    expect(relativeHours(at(72), now)).toBe("in 3 days");
  });

  it("speaks in the past for elapsed times and never says zero minutes", () => {
    expect(relativeHours(at(-5), now)).toBe("5 h ago");
    expect(relativeHours(at(0), now)).toBe("in 1 min");
  });
});

describe("formatINRCompact", () => {
  it("keeps amounts under a lakh in full, then uses lakh and crore", () => {
    expect(formatINRCompact(780_000)).toBe("₹7,800");
    expect(formatINRCompact(12_500_000)).toBe("₹1.3L");
    expect(formatINRCompact(428_000_000)).toBe("₹42.8L");
    expect(formatINRCompact(4_280_000_000)).toBe("₹4.3Cr");
  });
});
