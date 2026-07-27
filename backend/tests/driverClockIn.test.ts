import { describe, it, expect } from "vitest";
import { POST as clockIn } from "@/app/api/driver/clock-in/route";
import { prisma } from "@/lib/db";
import { createDriver, tokenFor, jsonRequest, FAKE_PHOTO } from "./helpers";

describe("POST /api/driver/clock-in", () => {
  it("clocks in successfully with a valid selfie", async () => {
    const { driver } = await createDriver();
    const token = await tokenFor(driver.id, "DRIVER", driver.name);
    const res = await clockIn(jsonRequest("/api/driver/clock-in", "POST", { selfie: FAKE_PHOTO }, token));
    expect(res.status).toBe(201);
  });

  it("rejects a second clock-in while one is already open", async () => {
    const { driver } = await createDriver();
    const token = await tokenFor(driver.id, "DRIVER", driver.name);
    const first = await clockIn(jsonRequest("/api/driver/clock-in", "POST", { selfie: FAKE_PHOTO }, token));
    expect(first.status).toBe(201);

    const second = await clockIn(jsonRequest("/api/driver/clock-in", "POST", { selfie: FAKE_PHOTO }, token));
    expect(second.status).toBe(409);

    const openCount = await prisma.timeEntry.count({ where: { driverId: driver.id, clockOutAt: null } });
    expect(openCount).toBe(1);
  });

  // Regression test for the race a security review found: two clock-ins
  // fired at nearly the same instant could both pass the "no open entry"
  // read before either write landed, producing two open shifts for one
  // driver (double pay/hours). Firing both without awaiting the first
  // exercises the real race, not just the sequential fast-path check above —
  // the DB-level partial unique index (see the
  // prevent_concurrent_open_shifts migration) is what's actually under test.
  it("allows only one open shift even when two clock-ins race concurrently", async () => {
    const { driver } = await createDriver();
    const token = await tokenFor(driver.id, "DRIVER", driver.name);

    const [a, b] = await Promise.all([
      clockIn(jsonRequest("/api/driver/clock-in", "POST", { selfie: FAKE_PHOTO }, token)),
      clockIn(jsonRequest("/api/driver/clock-in", "POST", { selfie: FAKE_PHOTO }, token)),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const openCount = await prisma.timeEntry.count({ where: { driverId: driver.id, clockOutAt: null } });
    expect(openCount).toBe(1);
  });
});
