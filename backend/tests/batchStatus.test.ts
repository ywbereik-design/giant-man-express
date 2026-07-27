import { describe, it, expect } from "vitest";
import { PATCH as batchStatus } from "@/app/api/driver/jobs/batch-status/route";
import { prisma } from "@/lib/db";
import { createDriver, createJobType, createJob, tokenFor, jsonRequest } from "./helpers";

describe("PATCH /api/driver/jobs/batch-status", () => {
  it("updates every eligible job and reports the new status", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const jobA = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ASSIGNED" });
    const jobB = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ASSIGNED" });
    const token = await tokenFor(driver.id, "DRIVER", driver.name);

    const res = await batchStatus(
      jsonRequest("/api/driver/jobs/batch-status", "PATCH", { jobIds: [jobA.id, jobB.id], status: "ACCEPTED" }, token)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(new Set(body.updatedIds)).toEqual(new Set([jobA.id, jobB.id]));
    expect(body.skipped).toHaveLength(0);

    const refreshed = await prisma.job.findMany({ where: { id: { in: [jobA.id, jobB.id] } } });
    expect(refreshed.every((j) => j.status === "ACCEPTED" && j.acceptedAt)).toBe(true);
  });

  it("skips a job that's no longer in the required source status, without touching it", async () => {
    // Simulates the race the batch endpoint is meant to guard against: by the
    // time this request is processed, jobB has already moved on from ASSIGNED
    // (e.g. a single-job update, or an offline-queue replay, got there first).
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const jobA = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ASSIGNED" });
    const jobB = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ACCEPTED" });
    const token = await tokenFor(driver.id, "DRIVER", driver.name);

    const res = await batchStatus(
      jsonRequest("/api/driver/jobs/batch-status", "PATCH", { jobIds: [jobA.id, jobB.id], status: "ACCEPTED" }, token)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updatedIds).toEqual([jobA.id]);
    expect(body.skipped).toEqual([{ id: jobB.id, reason: expect.stringContaining("Cannot move from ACCEPTED") }]);

    const untouched = await prisma.job.findUnique({ where: { id: jobB.id } });
    expect(untouched?.status).toBe("ACCEPTED");
  });

  it("does not let a driver batch-update another driver's job", async () => {
    const { driver: owner } = await createDriver();
    const { driver: intruder } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: owner.id, jobTypeId: jobType.id, status: "ASSIGNED" });
    const token = await tokenFor(intruder.id, "DRIVER", intruder.name);

    const res = await batchStatus(
      jsonRequest("/api/driver/jobs/batch-status", "PATCH", { jobIds: [job.id], status: "ACCEPTED" }, token)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updatedIds).toEqual([]);
    expect(body.skipped).toEqual([{ id: job.id, reason: "Not found" }]);
  });

  it("rejects PICKED_UP as a batch target (photo-required transitions aren't batchable)", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ARRIVED" });
    const token = await tokenFor(driver.id, "DRIVER", driver.name);

    const res = await batchStatus(
      jsonRequest("/api/driver/jobs/batch-status", "PATCH", { jobIds: [job.id], status: "PICKED_UP" }, token)
    );
    expect(res.status).toBe(400);
  });

  it("dedupes a repeated job id in the same request", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ASSIGNED" });
    const token = await tokenFor(driver.id, "DRIVER", driver.name);

    const res = await batchStatus(
      jsonRequest("/api/driver/jobs/batch-status", "PATCH", { jobIds: [job.id, job.id], status: "ACCEPTED" }, token)
    );
    const body = await res.json();
    expect(body.updatedIds).toEqual([job.id]);
  });
});
