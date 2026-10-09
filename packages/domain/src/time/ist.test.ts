import { describe, expect, it } from "vitest";
import {
  addDays,
  atIst,
  dateRange,
  daysBetween,
  formatLocalDate,
  isLocalDate,
  isLocalTime,
  isoWeekday,
  istDateOf,
  istTimeOf,
  isWeekdayInMask,
  WEEKDAYS_MON_SAT,
  weekdayMask,
} from "./ist";

describe("IST calendar arithmetic", () => {
  it("converts IST wall-clock to UTC instants (UTC+05:30, no DST)", () => {
    expect(atIst("2026-10-12", "11:00").toISOString()).toBe("2026-10-12T05:30:00.000Z");
    expect(atIst("2026-10-12", "00:15").toISOString()).toBe("2026-10-11T18:45:00.000Z");
  });

  it("reads IST dates across the UTC midnight boundary", () => {
    const lateEveningUtc = new Date("2026-10-12T20:00:00Z"); // 01:30 IST on the 13th
    expect(istDateOf(lateEveningUtc)).toBe("2026-10-13");
    expect(istTimeOf(lateEveningUtc)).toBe("01:30");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(daysBetween("2026-10-12", "2026-10-19")).toBe(7);
    expect(daysBetween("2026-10-19", "2026-10-12")).toBe(-7);
  });

  it("computes ISO weekdays", () => {
    expect(isoWeekday("2026-10-12")).toBe(1); // Monday
    expect(isoWeekday("2026-10-18")).toBe(7); // Sunday
  });

  it("builds and reads weekday masks", () => {
    expect(weekdayMask([1, 2, 3, 4, 5, 6])).toBe(WEEKDAYS_MON_SAT);
    expect(isWeekdayInMask(WEEKDAYS_MON_SAT, 6)).toBe(true);
    expect(isWeekdayInMask(WEEKDAYS_MON_SAT, 7)).toBe(false);
    expect(() => weekdayMask([8])).toThrow(RangeError);
  });

  it("validates date and time strings strictly", () => {
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(isLocalDate("2026-1-01")).toBe(false);
    expect(isLocalTime("23:59")).toBe(true);
    expect(isLocalTime("24:00")).toBe(false);
  });

  it("produces inclusive ranges and display labels", () => {
    expect(dateRange("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(formatLocalDate("2026-10-15")).toBe("Thu, 15 Oct");
  });
});
