/** Shared Vitest defaults so every package reports and times out the same way. */
export const sharedTestConfig = {
  environment: "node" as const,
  include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  testTimeout: 20_000,
  hookTimeout: 30_000,
};
