import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { DELETE as deleteJobPhoto } from "@/app/api/jobs/[id]/photo/route";
import { DELETE as deleteTimeEntryPhoto } from "@/app/api/drivers/time-entries/[id]/photo/route";
import { createStaff, createDriver, createJob, createJobType, tokenFor, jsonRequest, FAKE_PHOTO } from "./helpers";

describe("DELETE /api/jobs/[id]/photo", () => {
  it("clears only the requested photo, leaving the other stage's photo and timestamps intact", async () => {
    const { staff } = await createStaff({ role: "DISPATCH" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const deliveredAt = new Date();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "DELIVERED", deliveredAt });
    await prisma.job.update({ where: { id: job.id }, data: { pickupPhoto: FAKE_PHOTO, deliveryPhoto: FAKE_PHOTO } });
    const token = await tokenFor(staff.id, "DISPATCH", staff.name);

    const res = await deleteJobPhoto(jsonRequest(`/api/jobs/${job.id}/photo?type=pickup`, "DELETE", undefined, token), {
      params: { id: job.id },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job.pickupPhoto).toBeNull();
    expect(body.job.deliveryPhoto).toBe(FAKE_PHOTO);

    const reloaded = await prisma.job.findUnique({ where: { id: job.id } });
    expect(reloaded?.deliveredAt?.getTime()).toBe(deliveredAt.getTime());
  });

  it("rejects an invalid type value", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await deleteJobPhoto(jsonRequest(`/api/jobs/${job.id}/photo?type=nonsense`, "DELETE", undefined, token), {
      params: { id: job.id },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a driver-role session", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id });
    const token = await tokenFor(driver.id, "DRIVER", driver.name);

    const res = await deleteJobPhoto(jsonRequest(`/api/jobs/${job.id}/photo?type=pickup`, "DELETE", undefined, token), {
      params: { id: job.id },
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/drivers/time-entries/[id]/photo", () => {
  it("clears the clock-in selfie but leaves the shift's own record untouched", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const clockInAt = new Date();
    const entry = await prisma.timeEntry.create({
      data: { driverId: driver.id, clockInAt, clockInPhoto: FAKE_PHOTO, distanceKm: 12.3 },
    });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await deleteTimeEntryPhoto(jsonRequest(`/api/drivers/time-entries/${entry.id}/photo`, "DELETE", undefined, token), {
      params: { id: entry.id },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry.clockInPhoto).toBeNull();

    const reloaded = await prisma.timeEntry.findUnique({ where: { id: entry.id } });
    expect(reloaded?.clockInAt.getTime()).toBe(clockInAt.getTime());
    expect(reloaded?.distanceKm).toBe(12.3);
  });

  it("rejects an unauthenticated request", async () => {
    const { driver } = await createDriver();
    const entry = await prisma.timeEntry.create({
      data: { driverId: driver.id, clockInAt: new Date(), clockInPhoto: FAKE_PHOTO, distanceKm: 0 },
    });

    const res = await deleteTimeEntryPhoto(jsonRequest(`/api/drivers/time-entries/${entry.id}/photo`, "DELETE"), {
      params: { id: entry.id },
    });
    expect(res.status).toBe(401);
  });
});
