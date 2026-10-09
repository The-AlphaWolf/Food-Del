import { sharedTestConfig } from "@food-del/config/vitest";
import { defineConfig } from "vitest/config";

// Unit tests only; the Playwright journeys in e2e/ run with `pnpm e2e`.
export default defineConfig({ test: { ...sharedTestConfig } });
