import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { GET as listJobs, POST as createJobRoute } from "@/app/api/jobs/route";
import { GET as getJobRoute, PATCH as updateJobRoute } from "@/app/api/jobs/[id]/route";
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

describe("clientPhone — ADMIN-only, not visible or settable by Dispatch", () => {
  it("saves clientPhone when an admin sets it on create", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createJobRoute(
      jsonRequest(
        "/api/jobs",
        "POST",
        { title: "Admin job", jobTypeId: jobType.id, driverId: driver.id, clientPhone: "613-555-0100" },
        token
      )
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.job.clientPhone).toBe("613-555-0100");
  });

  it("silently ignores clientPhone when dispatch sets it on create", async () => {
    const { staff } = await createStaff({ role: "DISPATCH" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const token = await tokenFor(staff.id, "DISPATCH", staff.name);

    const res = await createJobRoute(
      jsonRequest(
        "/api/jobs",
        "POST",
        { title: "Dispatch job", jobTypeId: jobType.id, driverId: driver.id, clientPhone: "613-555-0100" },
        token
      )
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.job.clientPhone).toBeNull();
  });

  it("omits clientPhone from the list response for dispatch but includes it for admin", async () => {
    const { staff: admin } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const adminToken = await tokenFor(admin.id, "ADMIN", admin.name);
    await createJobRoute(
      jsonRequest(
        "/api/jobs",
        "POST",
        { title: "Phone job", jobTypeId: jobType.id, driverId: driver.id, clientPhone: "613-555-0199" },
        adminToken
      )
    );

    const adminList = await (await listJobs(getRequest("/api/jobs?limit=200", adminToken))).json();
    const adminJob = adminList.jobs.find((j: { title: string }) => j.title === "Phone job");
    expect(adminJob.clientPhone).toBe("613-555-0199");

    const { staff: dispatch } = await createStaff({ role: "DISPATCH" });
    const dispatchToken = await tokenFor(dispatch.id, "DISPATCH", dispatch.name);
    const dispatchList = await (await listJobs(getRequest("/api/jobs?limit=200", dispatchToken))).json();
    const dispatchJob = dispatchList.jobs.find((j: { title: string }) => j.title === "Phone job");
    expect(dispatchJob).toBeDefined();
    expect("clientPhone" in dispatchJob).toBe(false);
  });

  it("omits clientPhone from the single-job detail response for dispatch but includes it for admin", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id });
    await prisma.job.update({ where: { id: job.id }, data: { clientPhone: "613-555-0177" } });

    const adminToken = await tokenFor(staff.id, "ADMIN", staff.name);
    const adminBody = await (await getJobRoute(getRequest(`/api/jobs/${job.id}`, adminToken), { params: { id: job.id } })).json();
    expect(adminBody.job.clientPhone).toBe("613-555-0177");

    const { staff: dispatchStaff } = await createStaff({ role: "DISPATCH" });
    const dispatchToken = await tokenFor(dispatchStaff.id, "DISPATCH", dispatchStaff.name);
    const dispatchBody = await (
      await getJobRoute(getRequest(`/api/jobs/${job.id}`, dispatchToken), { params: { id: job.id } })
    ).json();
    expect("clientPhone" in dispatchBody.job).toBe(false);
  });

  it("silently ignores a dispatch PATCH attempt to set clientPhone", async () => {
    const { staff } = await createStaff({ role: "DISPATCH" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id });
    const token = await tokenFor(staff.id, "DISPATCH", staff.name);

    const res = await updateJobRoute(
      jsonRequest(`/api/jobs/${job.id}`, "PATCH", { clientPhone: "613-555-0188" }, token),
      { params: { id: job.id } }
    );
    expect(res.status).toBe(200);

    const updated = await prisma.job.findUnique({ where: { id: job.id } });
    expect(updated?.clientPhone).toBeNull();
  });

  it("lets an admin set clientPhone via PATCH", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await updateJobRoute(
      jsonRequest(`/api/jobs/${job.id}`, "PATCH", { clientPhone: "613-555-0188" }, token),
      { params: { id: job.id } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job.clientPhone).toBe("613-555-0188");
  });
});
