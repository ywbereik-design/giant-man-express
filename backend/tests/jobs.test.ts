import { describe, it, expect } from "vitest";
import { GET as listJobs, POST as createJobRoute } from "@/app/api/jobs/route";
import { createStaff, createDriver, createJobType, tokenFor, jsonRequest, getRequest } from "./helpers";

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
});
