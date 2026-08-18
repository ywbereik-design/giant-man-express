import { describe, it, expect } from "vitest";
import { GET as hoursByBusiness } from "@/app/api/reports/hours-by-business/route";
import { createStaff, createDriver, createJobType, createBusiness, createJob, tokenFor, getRequest } from "./helpers";

const PERIOD = "periodStart=2026-01-01T00:00:00.000Z&periodEnd=2026-02-01T00:00:00.000Z";

describe("GET /api/reports/hours-by-business", () => {
  it("aggregates hours per business/driver from pickedUpAt->deliveredAt", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const business = await createBusiness();
    const pickedUpAt = new Date("2026-01-15T08:00:00.000Z");
    const deliveredAt = new Date("2026-01-15T10:30:00.000Z");
    await createJob({ driverId: driver.id, jobTypeId: jobType.id, businessId: business.id, status: "DELIVERED", pickedUpAt, deliveredAt });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    // Scoped to this test's own business — the test DB is only truncated
    // once per whole `vitest run`, so without this, any other test creating
    // a delivered job for a *different* business inside this same hardcoded
    // January 2026 window (unscoped, this route aggregates every business)
    // would inflate rows.length here.
    const res = await hoursByBusiness(getRequest(`/api/reports/hours-by-business?${PERIOD}&businessId=${business.id}`, token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].totalHours).toBeCloseTo(2.5);
  });

  it("rejects a period longer than the max billing window", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await hoursByBusiness(
      getRequest("/api/reports/hours-by-business?periodStart=2020-01-01T00:00:00.000Z&periodEnd=2026-01-01T00:00:00.000Z", token)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/can't span more than/i);
  });

  it("rejects a non-admin/accountant session", async () => {
    const { staff } = await createStaff({ role: "DISPATCH" });
    const token = await tokenFor(staff.id, "DISPATCH", staff.name);

    const res = await hoursByBusiness(getRequest(`/api/reports/hours-by-business?${PERIOD}`, token));
    expect(res.status).toBe(403);
  });
});
