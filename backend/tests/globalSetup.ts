import path from "path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

// Runs once before the whole test run (Vitest's globalSetup, distinct from
// setupFiles which run per test file) — wipes the dedicated test database
// clean so every run starts from the same known-empty state, regardless of
// what a previous run left behind. Only ever touches DATABASE_URL from
// .env.test; never the real dev database.
export default async function globalSetup() {
  // override: true — see the comment in tests/setupEnv.ts.
  config({ path: path.resolve(__dirname, "../.env.test"), override: true });

  if (!process.env.DATABASE_URL?.includes("giant_man_test")) {
    throw new Error(
      "Refusing to run tests: DATABASE_URL does not point at giant_man_test. " +
        "Check backend/.env.test before running the suite."
    );
  }

  const prisma = new PrismaClient();
  const tables = [
    "InvoiceLineItem",
    "Invoice",
    "HoursReport",
    "LocationPing",
    "TimeEntry",
    "JobStop",
    "Job",
    "Business",
    "JobType",
    "Driver",
    "StaffUser",
    "RateLimitAttempt",
    "Counter",
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`);
  await prisma.$disconnect();
}
