import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { DELETE as deleteDriver } from "@/app/api/drivers/[id]/route";
import { createStaff, createDriver, createJobType, createJob, tokenFor, jsonRequest } from "./helpers";

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
