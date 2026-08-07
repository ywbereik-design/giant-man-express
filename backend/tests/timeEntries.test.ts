import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { GET as ownTimeEntries } from "@/app/api/driver/time-entries/route";
import { GET as driverTimeEntries } from "@/app/api/drivers/[id]/time-entries/route";
import { createStaff, createDriver, tokenFor, getRequest, FAKE_PHOTO } from "./helpers";

describe("GET /api/driver/time-entries", () => {
  it("never includes clockInPhoto — this screen doesn't display it", async () => {
    const { driver } = await createDriver();
    await prisma.timeEntry.create({ data: { driverId: driver.id, clockInAt: new Date(), clockInPhoto: FAKE_PHOTO, distanceKm: 0 } });
    const token = await tokenFor(driver.id, "DRIVER", driver.name);

    const res = await ownTimeEntries(getRequest("/api/driver/time-entries", token));
    const body = await res.json();
    expect(body.entries.length).toBeGreaterThan(0);
    for (const entry of body.entries) {
      expect(entry).not.toHaveProperty("clockInPhoto");
    }
  });
});

describe("GET /api/drivers/[id]/time-entries", () => {
  it("still includes clockInPhoto — SelfieReportsScreen depends on it", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    await prisma.timeEntry.create({ data: { driverId: driver.id, clockInAt: new Date(), clockInPhoto: FAKE_PHOTO, distanceKm: 0 } });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await driverTimeEntries(getRequest(`/api/drivers/${driver.id}/time-entries`, token), { params: { id: driver.id } });
    const body = await res.json();
    expect(body.entries[0].clockInPhoto).toBe(FAKE_PHOTO);
  });

  it("caps the page size well below the old 200-row limit, since every row can carry a full photo", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    for (let i = 0; i < 55; i++) {
      const clockInAt = new Date(Date.now() - (i + 1) * 8 * 3600000);
      await prisma.timeEntry.create({
        data: { driverId: driver.id, clockInAt, clockOutAt: new Date(clockInAt.getTime() + 3600000), distanceKm: 0 },
      });
    }
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    // A caller-requested limit above the new max should be clamped, not honored outright.
    const res = await driverTimeEntries(getRequest(`/api/drivers/${driver.id}/time-entries?limit=200`, token), { params: { id: driver.id } });
    const body = await res.json();
    expect(body.entries.length).toBe(50);
    expect(body.nextCursor).not.toBeNull();
  });
});
