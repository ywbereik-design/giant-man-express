import { describe, it, expect } from "vitest";
import { POST as clockIn } from "@/app/api/driver/clock-in/route";
import { PATCH as updateStatus } from "@/app/api/driver/jobs/[id]/status/route";
import { POST as createJobRoute } from "@/app/api/jobs/route";
import { createStaff, createDriver, createJobType, createJob, tokenFor, jsonRequest } from "./helpers";

// An SVG data URL can carry an embedded <script> or onload handler — a
// bare "starts with data:image/" check (the pre-audit behavior) let this
// through as a valid photo. See IMAGE_DATA_URL_PATTERN in
// src/lib/constants.ts.
const MALICIOUS_SVG_PHOTO =
  "data:image/svg+xml;base64," + Buffer.from('<svg onload="alert(document.cookie)"></svg>').toString("base64");

describe("photo upload MIME restriction", () => {
  it("rejects an SVG data URL on clock-in", async () => {
    const { driver } = await createDriver();
    const token = await tokenFor(driver.id, "DRIVER", driver.name);
    const res = await clockIn(jsonRequest("/api/driver/clock-in", "POST", { selfie: MALICIOUS_SVG_PHOTO }, token));
    expect(res.status).toBe(400);
  });

  it("rejects an SVG data URL on a pickup/delivery proof photo", async () => {
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const job = await createJob({ driverId: driver.id, jobTypeId: jobType.id, status: "ARRIVED" });
    const token = await tokenFor(driver.id, "DRIVER", driver.name);

    const res = await updateStatus(
      jsonRequest(`/api/driver/jobs/${job.id}/status`, "PATCH", { status: "PICKED_UP", photo: MALICIOUS_SVG_PHOTO }, token),
      { params: { id: job.id } }
    );
    expect(res.status).toBe(400);
  });
});

describe("job field length caps", () => {
  it("rejects a job title over the length cap", async () => {
    const { staff } = await createStaff();
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createJobRoute(
      jsonRequest(
        "/api/jobs",
        "POST",
        { title: "x".repeat(10_000), jobTypeId: jobType.id, driverId: driver.id },
        token
      )
    );
    expect(res.status).toBe(400);
  });

  it("rejects a dropoffAddresses array over the count cap", async () => {
    const { staff } = await createStaff();
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createJobRoute(
      jsonRequest(
        "/api/jobs",
        "POST",
        {
          title: "Test delivery",
          jobTypeId: jobType.id,
          driverId: driver.id,
          dropoffAddresses: Array.from({ length: 500 }, (_, i) => `Stop ${i}`),
        },
        token
      )
    );
    expect(res.status).toBe(400);
  });
});
