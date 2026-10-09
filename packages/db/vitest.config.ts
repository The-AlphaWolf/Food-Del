import { sharedTestConfig } from "@food-del/config/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    ...sharedTestConfig,
    // Test files share one database; run them one at a time.
    fileParallelism: false,
  },
});
