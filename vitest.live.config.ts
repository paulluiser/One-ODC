import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/live/**/*.test.ts"],
    testTimeout: 120000,
    hookTimeout: 30000,
    maxWorkers: 1,
    fileParallelism: false,
  },
});
