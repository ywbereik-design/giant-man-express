import { describe, it, expect, vi } from "vitest";
import { PATCH as updateStatus } from "@/app/api/driver/jobs/[id]/status/route";
import { prisma } from "@/lib/db";
import { createDriver, createJobType, createJob, tokenFor, jsonRequest, FAKE_PHOTO } from "./helpers";

async function driverToken(driverId: string, name: string) {
  return tokenFor(driverId, "DRIVER", name);
}

describe("PATCH /api/driver/jobs/[id]/status", () => {
  it("allows the assigned driver to accept a job", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ASSIGNED" });
    const token = await driverToken(driver.id, driver.name);

    const res = await updateStatus(jsonRequest(`/api/driver/jobs/${job.id}/status`, "PATCH", { status: "ACCEPTED" }, token), {
      params: { id: job.id },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job.status).toBe("ACCEPTED");
    expect(body.job.acceptedAt).toBeTruthy();
  });

  it("rejects a transition that skips a stage", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ASSIGNED" });
    const token = await driverToken(driver.id, driver.name);

    const res = await updateStatus(
      jsonRequest(`/api/driver/jobs/${job.id}/status`, "PATCH", { status: "PICKED_UP", photo: FAKE_PHOTO }, token),
      { params: { id: job.id } }
    );
    expect(res.status).toBe(400);
  });

  it("requires a proof photo to move to PICKED_UP when the job has a pickup address", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({
      driverId: driver.id,
      jobTypeId: jobType.id,
      status: "ARRIVED",
      pickupAddress: "123 Main St",
    });
    const token = await driverToken(driver.id, driver.name);

    const res = await updateStatus(
      jsonRequest(`/api/driver/jobs/${job.id}/status`, "PATCH", { status: "PICKED_UP" }, token),
      { params: { id: job.id } }
    );
    expect(res.status).toBe(400);
  });

  it("does not require a proof photo to move to PICKED_UP when the job has no pickup address", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ARRIVED" });
    const token = await driverToken(driver.id, driver.name);

    const res = await updateStatus(
      jsonRequest(`/api/driver/jobs/${job.id}/status`, "PATCH", { status: "PICKED_UP" }, token),
      { params: { id: job.id } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job.status).toBe("PICKED_UP");
    expect(body.job.pickupPhoto).toBeNull();
  });

  it("stores the photo and GPS metadata together when PICKED_UP succeeds", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ARRIVED" });
    const token = await driverToken(driver.id, driver.name);

    const res = await updateStatus(
      jsonRequest(
        `/api/driver/jobs/${job.id}/status`,
        "PATCH",
        { status: "PICKED_UP", photo: FAKE_PHOTO, lat: 45.5, lng: -73.6 },
        token
      ),
      { params: { id: job.id } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job.pickupPhoto).toBe(FAKE_PHOTO);
    expect(body.job.pickupLat).toBe(45.5);
    expect(body.job.pickupLng).toBe(-73.6);
    // Delivery-side fields must stay untouched by a pickup transition.
    expect(body.job.deliveryLat).toBeNull();
  });

  it("requires a reason to mark a job FAILED", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ARRIVED" });
    const token = await driverToken(driver.id, driver.name);

    const res = await updateStatus(jsonRequest(`/api/driver/jobs/${job.id}/status`, "PATCH", { status: "FAILED" }, token), {
      params: { id: job.id },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a failureReason outside the fixed list", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ARRIVED" });
    const token = await driverToken(driver.id, driver.name);

    const res = await updateStatus(
      jsonRequest(`/api/driver/jobs/${job.id}/status`, "PATCH", { status: "FAILED", failureReason: "Dog ate it" }, token),
      { params: { id: job.id } }
    );
    expect(res.status).toBe(400);
  });

  it("marks a job FAILED with a valid reason and sets failedAt", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ARRIVED" });
    const token = await driverToken(driver.id, driver.name);

    const res = await updateStatus(
      jsonRequest(
        `/api/driver/jobs/${job.id}/status`,
        "PATCH",
        { status: "FAILED", failureReason: "No Answer" },
        token
      ),
      { params: { id: job.id } }
    );
    expect(res.status).toBe(200);
    const updated = await prisma.job.findUnique({ where: { id: job.id } });
    expect(updated?.status).toBe("FAILED");
    expect(updated?.failureReason).toBe("No Answer");
    expect(updated?.failedAt).toBeTruthy();
  });

  it("only lets one of two concurrent status updates for the same job succeed", async () => {
    // The sibling batch-status endpoint already re-checks status at write
    // time to close exactly this race; this proves the single-job route now
    // does the same instead of silently letting the last write win.
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ARRIVED" });
    const token = await driverToken(driver.id, driver.name);

    const [r1, r2] = await Promise.all([
      updateStatus(jsonRequest(`/api/driver/jobs/${job.id}/status`, "PATCH", { status: "PICKED_UP" }, token), {
        params: { id: job.id },
      }),
      updateStatus(jsonRequest(`/api/driver/jobs/${job.id}/status`, "PATCH", { status: "PICKED_UP" }, token), {
        params: { id: job.id },
      }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const final = await prisma.job.findUnique({ where: { id: job.id } });
    expect(final?.status).toBe("PICKED_UP");
  });

  it("lets a job with no pickup address skip straight from ACCEPTED to ON_THE_WAY", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ACCEPTED" });
    const token = await driverToken(driver.id, driver.name);

    const res = await updateStatus(
      jsonRequest(`/api/driver/jobs/${job.id}/status`, "PATCH", { status: "ON_THE_WAY" }, token),
      { params: { id: job.id } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job.status).toBe("ON_THE_WAY");
    expect(body.job.onTheWayAt).toBeTruthy();
  });

  it("still rejects ACCEPTED -> ON_THE_WAY when the job has a pickup address", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({
      driverId: driver.id,
      jobTypeId: jobType.id,
      status: "ACCEPTED",
      pickupAddress: "123 Main St",
    });
    const token = await driverToken(driver.id, driver.name);

    const res = await updateStatus(
      jsonRequest(`/api/driver/jobs/${job.id}/status`, "PATCH", { status: "ON_THE_WAY" }, token),
      { params: { id: job.id } }
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for a job that belongs to a different driver", async () => {
    const { driver: owner } = await createDriver();
    const { driver: intruder } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: owner.id, jobTypeId: jobType.id, status: "ASSIGNED" });
    const token = await driverToken(intruder.id, intruder.name);

    const res = await updateStatus(jsonRequest(`/api/driver/jobs/${job.id}/status`, "PATCH", { status: "ACCEPTED" }, token), {
      params: { id: job.id },
    });
    expect(res.status).toBe(404);
  });

  it("blocks the write if the job is reassigned to a different driver between the ownership read and the update", async () => {
    // The route's ownership check (job.driverId !== auth.session.sub) reads
    // the job once, up front. If PATCH /api/jobs/[id] reassigns this job to
    // another driver in the gap before the write actually lands, id+status
    // alone used to still match in the updateMany's WHERE clause, letting the
    // now-unassigned driver push a status/photo/geo update onto a job that's
    // no longer theirs. Simulated deterministically here (rather than via
    // Promise.all, whose interleaving isn't guaranteed) by making the read
    // return a stale snapshot while a real reassignment happens in between.
    const { driver: originalDriver } = await createDriver();
    const { driver: newDriver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: originalDriver.id, jobTypeId: jobType.id, status: "ASSIGNED" });
    const token = await driverToken(originalDriver.id, originalDriver.name);

    const staleSnapshot = await prisma.job.findUnique({ where: { id: job.id } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy = vi.spyOn(prisma.job, "findUnique").mockImplementationOnce((async () => {
      await prisma.job.update({ where: { id: job.id }, data: { driverId: newDriver.id } });
      return staleSnapshot;
    }) as any);

    const res = await updateStatus(
      jsonRequest(`/api/driver/jobs/${job.id}/status`, "PATCH", { status: "ACCEPTED" }, token),
      { params: { id: job.id } }
    );
    spy.mockRestore();

    expect(res.status).toBe(409);
    const final = await prisma.job.findUnique({ where: { id: job.id } });
    expect(final?.status).toBe("ASSIGNED");
    expect(final?.driverId).toBe(newDriver.id);
  });
});
