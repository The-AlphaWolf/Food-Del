import { sharedTestConfig } from "@food-del/config/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { ...sharedTestConfig } });
