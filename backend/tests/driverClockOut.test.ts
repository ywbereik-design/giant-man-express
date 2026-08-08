import { describe, it, expect } from "vitest";
import { POST as clockIn } from "@/app/api/driver/clock-in/route";
import { POST as clockOut } from "@/app/api/driver/clock-out/route";
import { prisma } from "@/lib/db";
import { createDriver, tokenFor, jsonRequest, FAKE_PHOTO } from "./helpers";

describe("POST /api/driver/clock-out", () => {
  it("clocks out an open shift", async () => {
    const { driver } = await createDriver();
    const token = await tokenFor(driver.id, "DRIVER", driver.name);
    await clockIn(jsonRequest("/api/driver/clock-in", "POST", { selfie: FAKE_PHOTO }, token));

    const res = await clockOut(jsonRequest("/api/driver/clock-out", "POST", {}, token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry.clockOutAt).not.toBeNull();
  });

  it("rejects clocking out when there's no open shift", async () => {
    const { driver } = await createDriver();
    const token = await tokenFor(driver.id, "DRIVER", driver.name);

    const res = await clockOut(jsonRequest("/api/driver/clock-out", "POST", {}, token));
    expect(res.status).toBe(409);
  });

  // Regression test: without the clockOutAt: null guard, a double-tap could
  // have both requests read the same open entry and both write a clock-out,
  // each reporting success while only one lat/lng pair actually survives.
  it("only lets one of two concurrent clock-outs on the same shift succeed", async () => {
    const { driver } = await createDriver();
    const token = await tokenFor(driver.id, "DRIVER", driver.name);
    await clockIn(jsonRequest("/api/driver/clock-in", "POST", { selfie: FAKE_PHOTO }, token));

    const [a, b] = await Promise.all([
      clockOut(jsonRequest("/api/driver/clock-out", "POST", { lat: 1, lng: 1 }, token)),
      clockOut(jsonRequest("/api/driver/clock-out", "POST", { lat: 2, lng: 2 }, token)),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const closedCount = await prisma.timeEntry.count({ where: { driverId: driver.id, clockOutAt: { not: null } } });
    expect(closedCount).toBe(1);
  });
});
