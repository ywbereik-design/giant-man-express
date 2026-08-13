import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { GET as listDrivers, POST as createDriverRoute } from "@/app/api/drivers/route";
import { PATCH as updateDriver, DELETE as deleteDriver } from "@/app/api/drivers/[id]/route";
import { GET as driverStatus } from "@/app/api/driver/status/route";
import { createStaff, createDriver, createJobType, createJob, tokenFor, jsonRequest, getRequest } from "./helpers";

describe("GET /api/drivers", () => {
  // The test DB is only truncated once per whole `vitest run`, so other
  // tests may have already created plenty of driver rows by the time this
  // runs — rather than guess a fixed number of pages, derive the expected
  // total from an unpaginated fetch first, so the loop bound (and the
  // final coverage check) is exact regardless of what else has run.
  it("pages through the full driver list with cursor+limit, covering every driver exactly once", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);
    await Promise.all([createDriver(), createDriver(), createDriver()]);

    const full = await (await listDrivers(getRequest("/api/drivers?limit=100", token))).json();
    const allIds = new Set<string>(full.drivers.map((d: { id: string }) => d.id));
    expect(allIds.size).toBeGreaterThanOrEqual(3);

    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const res = await listDrivers(getRequest(`/api/drivers?limit=1${cursor ? `&cursor=${cursor}` : ""}`, token));
      const body = await res.json();
      expect(body.drivers.length).toBeLessThanOrEqual(1);
      for (const d of body.drivers) {
        expect(seen.has(d.id)).toBe(false);
        seen.add(d.id);
      }
      cursor = body.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages <= allIds.size + 5);

    expect(seen).toEqual(allIds);
  });
});

describe("PATCH /api/drivers/[id]", () => {
  it("invalidates the driver's existing token when an admin resets their PIN", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const adminToken = await tokenFor(staff.id, "ADMIN", staff.name);
    const driverOldToken = await tokenFor(driver.id, "DRIVER", driver.name, 0);

    const res = await updateDriver(jsonRequest(`/api/drivers/${driver.id}`, "PATCH", { pin: "9999" }, adminToken), {
      params: { id: driver.id },
    });
    expect(res.status).toBe(200);

    const check = await driverStatus(getRequest("/api/driver/status", driverOldToken));
    expect(check.status).toBe(401);
  });

  it("doesn't touch tokenVersion when no PIN is being changed", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const adminToken = await tokenFor(staff.id, "ADMIN", staff.name);
    const driverOldToken = await tokenFor(driver.id, "DRIVER", driver.name, 0);

    const res = await updateDriver(jsonRequest(`/api/drivers/${driver.id}`, "PATCH", { name: "Renamed" }, adminToken), {
      params: { id: driver.id },
    });
    expect(res.status).toBe(200);

    const check = await driverStatus(getRequest("/api/driver/status", driverOldToken));
    expect(check.status).toBe(200);
  });
});

describe("DELETE /api/drivers/[id]", () => {
  it("deletes a driver with no job/shift/report history", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await deleteDriver(jsonRequest(`/api/drivers/${driver.id}`, "DELETE", undefined, token), {
      params: { id: driver.id },
    });
    expect(res.status).toBe(200);
    expect(await prisma.driver.findUnique({ where: { id: driver.id } })).toBeNull();
  });

  it("refuses to delete a driver with job history, telling the admin to deactivate instead", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    await createJob({ driverId: driver.id, jobTypeId: jobType.id });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await deleteDriver(jsonRequest(`/api/drivers/${driver.id}`, "DELETE", undefined, token), {
      params: { id: driver.id },
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/deactivate/i);
    expect(await prisma.driver.findUnique({ where: { id: driver.id } })).not.toBeNull();
  });

  it("refuses to delete a driver with shift (time entry) history", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    await prisma.timeEntry.create({ data: { driverId: driver.id, clockInAt: new Date(), distanceKm: 0 } });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await deleteDriver(jsonRequest(`/api/drivers/${driver.id}`, "DELETE", undefined, token), {
      params: { id: driver.id },
    });
    expect(res.status).toBe(409);
  });

  it("rejects a non-admin session", async () => {
    const { staff } = await createStaff({ role: "DISPATCH" });
    const { driver } = await createDriver();
    const token = await tokenFor(staff.id, "DISPATCH", staff.name);

    const res = await deleteDriver(jsonRequest(`/api/drivers/${driver.id}`, "DELETE", undefined, token), {
      params: { id: driver.id },
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for a nonexistent driver", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await deleteDriver(jsonRequest("/api/drivers/does-not-exist", "DELETE", undefined, token), {
      params: { id: "does-not-exist" },
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/drivers — fleet/compliance fields", () => {
  it("creates a driver with truckResponsibility, license number, expiry, and grade", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createDriverRoute(
      jsonRequest(
        "/api/drivers",
        "POST",
        {
          name: "Fleet Test Driver",
          employeeCode: `FLEET-${Date.now()}`,
          pin: "4321",
          truckResponsibility: "Truck #4 — plate ABC123",
          licenseNumber: "L1234567",
          licenseExpiry: "2027-06-30",
          licenseGrade: "G",
        },
        token
      )
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.driver.truckResponsibility).toBe("Truck #4 — plate ABC123");
    expect(body.driver.licenseNumber).toBe("L1234567");
    expect(body.driver.licenseExpiry).toBe("2027-06-30T00:00:00.000Z");
    expect(body.driver.licenseGrade).toBe("G");
  });

  it("creates a driver fine with none of the fleet fields set", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createDriverRoute(
      jsonRequest(
        "/api/drivers",
        "POST",
        { name: "No Fleet Info", employeeCode: `NOFLEET-${Date.now()}`, pin: "4321" },
        token
      )
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.driver.truckResponsibility).toBeNull();
    expect(body.driver.licenseExpiry).toBeNull();
  });

  it("rejects a truckResponsibility over the length bound", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createDriverRoute(
      jsonRequest(
        "/api/drivers",
        "POST",
        { name: "Too Long", employeeCode: `TOOLONG-${Date.now()}`, pin: "4321", truckResponsibility: "x".repeat(101) },
        token
      )
    );
    expect(res.status).toBe(400);
  });

  it("rejects a license expiry that isn't YYYY-MM-DD", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createDriverRoute(
      jsonRequest(
        "/api/drivers",
        "POST",
        { name: "Bad Date", employeeCode: `BADDATE-${Date.now()}`, pin: "4321", licenseExpiry: "06/30/2027" },
        token
      )
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/drivers/[id] — fleet/compliance fields", () => {
  it("updates and then clears the fleet fields", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const setRes = await updateDriver(
      jsonRequest(
        `/api/drivers/${driver.id}`,
        "PATCH",
        { truckResponsibility: "Truck #2", licenseNumber: "T-999", licenseExpiry: "2026-12-31", licenseGrade: "AZ" },
        token
      ),
      { params: { id: driver.id } }
    );
    expect(setRes.status).toBe(200);
    const setBody = await setRes.json();
    expect(setBody.driver.truckResponsibility).toBe("Truck #2");
    expect(setBody.driver.licenseGrade).toBe("AZ");

    // Empty string explicitly clears each field back to null.
    const clearRes = await updateDriver(
      jsonRequest(
        `/api/drivers/${driver.id}`,
        "PATCH",
        { truckResponsibility: "", licenseNumber: "", licenseExpiry: "", licenseGrade: "" },
        token
      ),
      { params: { id: driver.id } }
    );
    expect(clearRes.status).toBe(200);
    const clearBody = await clearRes.json();
    expect(clearBody.driver.truckResponsibility).toBeNull();
    expect(clearBody.driver.licenseNumber).toBeNull();
    expect(clearBody.driver.licenseExpiry).toBeNull();
    expect(clearBody.driver.licenseGrade).toBeNull();
  });
});
