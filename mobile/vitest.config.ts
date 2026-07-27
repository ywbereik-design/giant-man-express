import { defineConfig } from "vitest/config";

// Covers the pure-logic modules only (routeDestination, jobStatus,
// validation, the decision logic inside capturePhoto/offlineQueue) — not
// full component rendering, which would need a real RN test environment
// (jest-expo) that this project doesn't have set up. Native-module-backed
// modules (expo-file-system, expo-image-picker, expo-image-manipulator,
// the api client) are mocked per-file with vi.mock rather than requiring
// that environment.
export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 10000,
  },
});
