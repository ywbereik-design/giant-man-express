import { describe, it, expect } from "vitest";
import { GET as listInvoices, POST as createInvoice } from "@/app/api/invoices/route";
import { GET as listReports, POST as createReport } from "@/app/api/reports/route";
import { GET as hoursByBusiness } from "@/app/api/reports/hours-by-business/route";
import { GET as listBusinesses, POST as createBusiness } from "@/app/api/businesses/route";
import { GET as getBusiness, PATCH as updateBusiness } from "@/app/api/businesses/[id]/route";
import { GET as getMe } from "@/app/api/auth/me/route";
import { PATCH as changePassword } from "@/app/api/account/password/route";
import { POST as createStaffRoute } from "@/app/api/staff/route";
import { POST as createDriverRoute } from "@/app/api/drivers/route";
import { POST as createJobType } from "@/app/api/job-types/route";
import { POST as createJobRoute } from "@/app/api/jobs/route";
import { createStaff, createBusiness as createBusinessFixture, tokenFor, jsonRequest, getRequest } from "./helpers";

const PERIOD = { periodStart: "2026-01-01T00:00:00.000Z", periodEnd: "2026-02-01T00:00:00.000Z" };

async function accountantToken() {
  const { staff } = await createStaff({ role: "ACCOUNTANT" });
  return { staff, token: await tokenFor(staff.id, "ACCOUNTANT", staff.name) };
}

describe("ACCOUNTANT role — granted access", () => {
  it("can list and generate invoices", async () => {
    const { token } = await accountantToken();
    const business = await createBusinessFixture();

    const list = await listInvoices(getRequest("/api/invoices", token));
    expect(list.status).toBe(200);

    // No un-invoiced jobs in period — 400 is the correct "no bypass, but
    // not a permissions error" response, proving the request got past the
    // role gate into the actual business logic.
    const create = await createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, ...PERIOD }, token));
    expect(create.status).toBe(400);
  });

  it("can list and generate hours reports, and view hours-by-business", async () => {
    const { token } = await accountantToken();

    const list = await listReports(getRequest("/api/reports", token));
    expect(list.status).toBe(200);

    const hbb = await hoursByBusiness(getRequest(`/api/reports/hours-by-business?${new URLSearchParams(PERIOD)}`, token));
    expect(hbb.status).toBe(200);

    const create = await createReport(jsonRequest("/api/reports", "POST", { driverId: "nonexistent", ...PERIOD }, token));
    expect(create.status).toBe(404); // past the role gate, into "driver not found"
  });

  it("has full (not Dispatch-restricted) access to businesses, including billingRate", async () => {
    const { token } = await accountantToken();
    const business = await createBusinessFixture({ billingRate: 88 });

    const list = await listBusinesses(getRequest("/api/businesses", token));
    expect(list.status).toBe(200);
    const listBody = await list.json();
    const found = listBody.businesses.find((b: { id: string }) => b.id === business.id);
    expect(found.billingRate).toBe(88); // not stripped, unlike the Dispatch-restricted select

    const single = await getBusiness(getRequest(`/api/businesses/${business.id}`, token), { params: { id: business.id } });
    expect(single.status).toBe(200);

    const created = await createBusiness(jsonRequest("/api/businesses", "POST", { name: "New Client", billingRate: 50 }, token));
    expect(created.status).toBe(201);

    const updated = await updateBusiness(
      jsonRequest(`/api/businesses/${business.id}`, "PATCH", { billingRate: 99 }, token),
      { params: { id: business.id } }
    );
    expect(updated.status).toBe(200);
  });

  it("has a working session check and can change its own password", async () => {
    const { staff, token } = await accountantToken();

    const me = await getMe(getRequest("/api/auth/me", token));
    expect(me.status).toBe(200);
    const meBody = await me.json();
    expect(meBody.role).toBe("ACCOUNTANT");

    const change = await changePassword(
      jsonRequest("/api/account/password", "PATCH", { currentPassword: "test-password-123", newPassword: "a-new-real-password" }, token)
    );
    expect(change.status).toBe(200);
    void staff;
  });
});

describe("ACCOUNTANT role — denied access outside its finance scope", () => {
  it("cannot manage staff accounts", async () => {
    const { token } = await accountantToken();
    const res = await createStaffRoute(
      jsonRequest("/api/staff", "POST", { name: "X", email: `x-${Date.now()}@example.com`, password: "a-real-password", role: "DISPATCH" }, token)
    );
    expect(res.status).toBe(403);
  });

  it("cannot create drivers", async () => {
    const { token } = await accountantToken();
    const res = await createDriverRoute(
      jsonRequest("/api/drivers", "POST", { name: "New Driver", employeeCode: `ACC-${Date.now()}`, pin: "1234" }, token)
    );
    expect(res.status).toBe(403);
  });

  it("cannot manage job types", async () => {
    const { token } = await accountantToken();
    const res = await createJobType(jsonRequest("/api/job-types", "POST", { name: "New Type" }, token));
    expect(res.status).toBe(403);
  });

  it("cannot create or dispatch jobs", async () => {
    const { token } = await accountantToken();
    const res = await createJobRoute(
      jsonRequest("/api/jobs", "POST", { title: "X", jobTypeId: "nonexistent", driverId: "nonexistent" }, token)
    );
    expect(res.status).toBe(403);
  });
});
