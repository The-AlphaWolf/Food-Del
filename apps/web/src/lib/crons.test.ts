import { readFileSync } from "node:fs";
import { JOB_CADENCE_MINUTES, JOB_NAMES } from "@food-del/domain/contracts";
import { describe, expect, it } from "vitest";

const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
  crons: { path: string; schedule: string }[];
};

/** Minutes between runs for the simple schedules we use. */
function cadence(schedule: string): number {
  const [minute, hour, ...rest] = schedule.split(" ");
  if (rest.some((f) => f !== "*")) throw new Error(`Unsupported schedule ${schedule}`);
  if (hour === "*") {
    if (minute === "*") return 1;
    const step = /^\*\/(\d+)$/.exec(minute!);
    return step ? Number(step[1]) : 60;
  }
  if (/^\d+$/.test(hour!) && /^\d+$/.test(minute!)) return 1440;
  throw new Error(`Unsupported schedule ${schedule}`);
}

describe("Vercel cron schedules", () => {
  it("run every job at the cadence the health checks expect", () => {
    const scheduled = Object.fromEntries(
      vercel.crons.map((c) => [c.path.replace("/api/v1/jobs/", ""), cadence(c.schedule)]),
    );
    expect(Object.keys(scheduled).sort()).toEqual([...JOB_NAMES].sort());
    expect(scheduled).toEqual(JOB_CADENCE_MINUTES);
  });
});
