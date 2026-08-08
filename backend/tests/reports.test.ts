import { describe, it, expect } from "vitest";
import { GET as listReports, POST as createReport } from "@/app/api/reports/route";
import { createStaff, createDriver, tokenFor, getRequest, jsonRequest } from "./helpers";

describe("GET /api/reports", () => {
  it("never includes entriesJson — only the PDF route needs the full snapshot", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);
    await createReport(
      jsonRequest(
        "/api/reports",
        "POST",
        { driverId: driver.id, periodStart: "2026-01-01T00:00:00.000Z", periodEnd: "2026-01-08T00:00:00.000Z" },
        token
      )
    );

    const res = await listReports(getRequest("/api/reports", token));
    const body = await res.json();
    expect(body.reports.length).toBeGreaterThan(0);
    for (const report of body.reports) {
      expect(report).not.toHaveProperty("entriesJson");
    }
  });
});
