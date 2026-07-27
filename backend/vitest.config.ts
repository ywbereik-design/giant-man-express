import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Loads .env.test into process.env before any test file's own imports
    // run — critical here, since @/lib/db constructs its PrismaClient
    // singleton at import time, reading DATABASE_URL from process.env at
    // that moment. Without this running first, tests would silently hit
    // whatever .env's DATABASE_URL happens to be (the real dev database).
    setupFiles: ["./tests/setupEnv.ts"],
    globalSetup: ["./tests/globalSetup.ts"],
    testTimeout: 15000,
    // Runs test files sequentially in one process rather than Vitest's
    // default parallel-worker isolation — several tests share the same
    // Postgres connection pool via the @/lib/db singleton, and running
    // files concurrently against the same test database risks cross-test
    // data collisions (two files both listing "all jobs" while the other
    // is mid-insert). The suite is small enough that this costs little.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*": ["./src/*"] — Vitest (via Vite)
      // doesn't read tsconfig path aliases on its own.
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
