import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { GET as listJobs, POST as createJobRoute } from "@/app/api/jobs/route";
import { GET as getJobRoute } from "@/app/api/jobs/[id]/route";
import { createStaff, createDriver, createJob, createJobType, tokenFor, jsonRequest, getRequest, FAKE_PHOTO } from "./helpers";

describe("POST /api/jobs", () => {
  it("lets dispatch create a job for an active driver and job type", async () => {
    const { staff } = await createStaff({ role: "DISPATCH" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const token = await tokenFor(staff.id, "DISPATCH", staff.name);

    const res = await createJobRoute(
      jsonRequest("/api/jobs", "POST", { title: "Test delivery", jobTypeId: jobType.id, driverId: driver.id }, token)
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.job.status).toBe("ASSIGNED");
    expect(body.job.driver.id).toBe(driver.id);
  });

  it("rejects an inactive driver even though it's a valid driver id", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver({ active: false });
    const jobType = await createJobType();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createJobRoute(
      jsonRequest("/api/jobs", "POST", { title: "Test delivery", jobTypeId: jobType.id, driverId: driver.id }, token)
    );
    expect(res.status).toBe(400);
  });

  it("rejects a request with no session", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const res = await createJobRoute(
      jsonRequest("/api/jobs", "POST", { title: "Test delivery", jobTypeId: jobType.id, driverId: driver.id })
    );
    expect(res.status).toBe(401);
  });

  it("rejects a driver-role session (jobs are staff-only)", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const token = await tokenFor(driver.id, "DRIVER", driver.name);
    const res = await createJobRoute(
      jsonRequest("/api/jobs", "POST", { title: "Test delivery", jobTypeId: jobType.id, driverId: driver.id }, token)
    );
    expect(res.status).toBe(403);
  });

  it("rejects an invalid clientPhone", async () => {
    const { staff } = await createStaff();
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);
    const res = await createJobRoute(
      jsonRequest(
        "/api/jobs",
        "POST",
        { title: "Test delivery", jobTypeId: jobType.id, driverId: driver.id, clientPhone: "call me maybe" },
        token
      )
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/jobs", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await listJobs(getRequest("/api/jobs"));
    expect(res.status).toBe(401);
  });

  it("returns jobs for an admin session", async () => {
    const { staff } = await createStaff();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);
    const res = await listJobs(getRequest("/api/jobs", token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.jobs)).toBe(true);
  });

  it("pages through results with cursor+limit, covering every job exactly once", async () => {
    const { staff } = await createStaff();
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    for (const title of ["Job A", "Job B", "Job C"]) {
      const res = await createJobRoute(jsonRequest("/api/jobs", "POST", { title, jobTypeId: jobType.id, driverId: driver.id }, token));
      expect(res.status).toBe(201);
    }

    const page1 = await (await listJobs(getRequest(`/api/jobs?driverId=${driver.id}&limit=2`, token))).json();
    expect(page1.jobs).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await (await listJobs(getRequest(`/api/jobs?driverId=${driver.id}&limit=2&cursor=${page1.nextCursor}`, token))).json();
    expect(page2.jobs).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();

    const allIds = [...page1.jobs, ...page2.jobs].map((j: { id: string }) => j.id);
    expect(new Set(allIds).size).toBe(3);
  });

  it("excludes pickupPhoto/deliveryPhoto from the list response even when set", async () => {
    const { staff } = await createStaff();
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id });
    await prisma.job.update({ where: { id: job.id }, data: { pickupPhoto: FAKE_PHOTO, deliveryPhoto: FAKE_PHOTO } });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await listJobs(getRequest(`/api/jobs?driverId=${driver.id}`, token));
    const body = await res.json();
    const listed = body.jobs.find((j: { id: string }) => j.id === job.id);
    expect(listed).toBeDefined();
    expect(listed).not.toHaveProperty("pickupPhoto");
    expect(listed).not.toHaveProperty("deliveryPhoto");
  });
});

describe("GET /api/jobs/[id]", () => {
  it("returns the full job including photos", async () => {
    const { staff } = await createStaff();
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id });
    await prisma.job.update({ where: { id: job.id }, data: { pickupPhoto: FAKE_PHOTO } });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await getJobRoute(getRequest(`/api/jobs/${job.id}`, token), { params: { id: job.id } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job.pickupPhoto).toBe(FAKE_PHOTO);
  });

  it("returns 404 for a nonexistent job", async () => {
    const { staff } = await createStaff();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);
    const res = await getJobRoute(getRequest("/api/jobs/does-not-exist", token), { params: { id: "does-not-exist" } });
    expect(res.status).toBe(404);
  });

  it("rejects a driver-role session", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id });
    const token = await tokenFor(driver.id, "DRIVER", driver.name);
    const res = await getJobRoute(getRequest(`/api/jobs/${job.id}`, token), { params: { id: job.id } });
    expect(res.status).toBe(403);
  });
});
