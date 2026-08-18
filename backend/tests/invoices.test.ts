import { describe, it, expect, vi } from "vitest";

// The PDF route's own tsconfig sets jsx: "preserve" (correct for Next.js's
// SWC build, which handles JSX itself) — Vite's test transform doesn't
// override that the same way, so actually loading InvoiceDocument.tsx's
// JSX under Vitest fails to parse. Mocking both the renderer and the
// document component sidesteps that entirely, which is also the right
// testing boundary here: these tests exercise the route's RBAC/data logic,
// not @react-pdf/renderer's actual rendering.
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn(async () => Buffer.from("fake-pdf-content")),
}));
vi.mock("@/lib/pdf/InvoiceDocument", () => ({
  InvoiceDocument: vi.fn(() => null),
}));

import { GET as listInvoices, POST as createInvoice } from "@/app/api/invoices/route";
import { GET as invoicePdf } from "@/app/api/invoices/[id]/pdf/route";
import { prisma } from "@/lib/db";
import { createStaff, createDriver, createJobType, createBusiness, createJob, tokenFor, jsonRequest, getRequest } from "./helpers";

const PERIOD = { periodStart: "2026-01-01T00:00:00.000Z", periodEnd: "2026-02-01T00:00:00.000Z" };
const IN_PERIOD = new Date("2026-01-15T00:00:00.000Z");

describe("POST /api/invoices", () => {
  it("generates an invoice covering every un-invoiced delivered job in the period", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const business = await createBusiness({ billingRate: 75 });
    await createJob({ driverId: driver.id, jobTypeId: jobType.id, businessId: business.id, status: "DELIVERED", deliveredAt: IN_PERIOD });
    await createJob({ driverId: driver.id, jobTypeId: jobType.id, businessId: business.id, status: "DELIVERED", deliveredAt: IN_PERIOD });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, ...PERIOD }, token));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invoice.lineItems).toHaveLength(2);
    expect(body.invoice.totalAmount).toBe(150);
  });

  it("rejects a business with no billing rate set", async () => {
    const { staff } = await createStaff();
    const business = await createBusiness({ billingRate: null });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, ...PERIOD }, token));
    expect(res.status).toBe(400);
  });

  it("rejects a period with no un-invoiced delivered jobs", async () => {
    const { staff } = await createStaff();
    const business = await createBusiness();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, ...PERIOD }, token));
    expect(res.status).toBe(400);
  });

  it("rejects a period longer than the max billing window, before it ever queries jobs", async () => {
    const { staff } = await createStaff();
    const business = await createBusiness();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createInvoice(
      jsonRequest(
        "/api/invoices",
        "POST",
        { businessId: business.id, periodStart: "2020-01-01T00:00:00.000Z", periodEnd: "2026-01-01T00:00:00.000Z" },
        token
      )
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.fieldErrors.periodEnd[0]).toMatch(/can't span more than/i);
  });

  it("accepts a period right at the max billing window", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const business = await createBusiness({ billingRate: 75 });
    const periodStart = "2025-01-01T00:00:00.000Z";
    const periodEnd = "2026-01-02T00:00:00.000Z"; // exactly 366 days
    await createJob({
      driverId: driver.id,
      jobTypeId: jobType.id,
      businessId: business.id,
      status: "DELIVERED",
      deliveredAt: new Date("2025-06-01T00:00:00.000Z"),
    });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, periodStart, periodEnd }, token));
    expect(res.status).toBe(201);
  });

  it("never bills the same delivered job twice", async () => {
    const { staff } = await createStaff();
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const business = await createBusiness();
    await createJob({ driverId: driver.id, jobTypeId: jobType.id, businessId: business.id, status: "DELIVERED", deliveredAt: IN_PERIOD });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const first = await createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, ...PERIOD }, token));
    expect(first.status).toBe(201);

    const second = await createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, ...PERIOD }, token));
    expect(second.status).toBe(400);
  });

  // Regression coverage for the double-billing race the security audit
  // verified was already closed by @@unique([jobId]) + runOrRespond's P2002
  // handling — firing both without awaiting the first exercises the real
  // race, not just the sequential "already invoiced" check above. Which
  // *error code* the loser gets depends on exact timing: it can lose at the
  // route's own pre-check (400, "no un-invoiced jobs") if the winner's
  // transaction already committed by then, or at the DB constraint (409)
  // if both reached the write first — both are correct, safe outcomes. The
  // only invariant that actually matters is that the job never gets billed
  // twice.
  it("never double-bills a job even when two invoice requests race", async () => {
    const { staff } = await createStaff();
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const business = await createBusiness();
    await createJob({ driverId: driver.id, jobTypeId: jobType.id, businessId: business.id, status: "DELIVERED", deliveredAt: IN_PERIOD });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const [a, b] = await Promise.all([
      createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, ...PERIOD }, token)),
      createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, ...PERIOD }, token)),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(201);
    expect([400, 409]).toContain(statuses[1]);

    const invoiceCount = await prisma.invoice.count({ where: { businessId: business.id } });
    expect(invoiceCount).toBe(1);
    const lineItemCount = await prisma.invoiceLineItem.count({ where: { invoice: { businessId: business.id } } });
    expect(lineItemCount).toBe(1);
  });

  it("rejects a DISPATCH session — invoices are financial data, ADMIN-only", async () => {
    const { staff } = await createStaff({ role: "DISPATCH" });
    const business = await createBusiness();
    const token = await tokenFor(staff.id, "DISPATCH", staff.name);

    const res = await createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, ...PERIOD }, token));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/invoices — PER_HOUR billing", () => {
  it("bills each job by hours worked (pickedUpAt -> deliveredAt) at the hourly rate", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const business = await createBusiness({ billingRate: 40, billingType: "PER_HOUR" });
    const pickedUpAt = new Date("2026-01-15T10:00:00.000Z");
    const deliveredAt = new Date("2026-01-15T12:30:00.000Z"); // exactly 2.5h
    await createJob({
      driverId: driver.id,
      jobTypeId: jobType.id,
      businessId: business.id,
      status: "DELIVERED",
      pickedUpAt,
      deliveredAt,
    });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, ...PERIOD }, token));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invoice.lineItems).toHaveLength(1);
    expect(body.invoice.lineItems[0].quantity).toBe(2.5);
    expect(body.invoice.totalAmount).toBe(100); // 2.5h * $40/h
  });

  it("skips a job with no pickedUpAt/deliveredAt span and rejects if none are billable", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const business = await createBusiness({ billingRate: 40, billingType: "PER_HOUR" });
    // Delivered, in period, but never actually picked up (no pickedUpAt) —
    // can happen for a job with no pickup address (see DRIVER_ALLOWED_TRANSITIONS'
    // ACCEPTED -> ON_THE_WAY skip).
    await createJob({
      driverId: driver.id,
      jobTypeId: jobType.id,
      businessId: business.id,
      status: "DELIVERED",
      deliveredAt: IN_PERIOD,
    });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, ...PERIOD }, token));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/valid pickup\/delivery time/i);
  });
});

describe("POST /api/invoices — FLAT_RATE billing", () => {
  it("bills one flat total regardless of how many jobs are in the period", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const business = await createBusiness({ billingRate: 500, billingType: "FLAT_RATE" });
    await createJob({ driverId: driver.id, jobTypeId: jobType.id, businessId: business.id, status: "DELIVERED", deliveredAt: IN_PERIOD });
    await createJob({ driverId: driver.id, jobTypeId: jobType.id, businessId: business.id, status: "DELIVERED", deliveredAt: IN_PERIOD });
    await createJob({ driverId: driver.id, jobTypeId: jobType.id, businessId: business.id, status: "DELIVERED", deliveredAt: IN_PERIOD });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, ...PERIOD }, token));
    expect(res.status).toBe(201);
    const body = await res.json();
    // 3 job-audit line items ($0 each) + 1 flat-rate summary line item.
    expect(body.invoice.lineItems).toHaveLength(4);
    expect(body.invoice.totalAmount).toBe(500);
  });

  it("still links every covered job so a later invoice can't re-bill them", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const business = await createBusiness({ billingRate: 500, billingType: "FLAT_RATE" });
    await createJob({ driverId: driver.id, jobTypeId: jobType.id, businessId: business.id, status: "DELIVERED", deliveredAt: IN_PERIOD });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const first = await createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, ...PERIOD }, token));
    expect(first.status).toBe(201);

    const second = await createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, ...PERIOD }, token));
    expect(second.status).toBe(400);
  });
});

describe("GET /api/invoices", () => {
  it("rejects a DISPATCH session", async () => {
    const { staff } = await createStaff({ role: "DISPATCH" });
    const token = await tokenFor(staff.id, "DISPATCH", staff.name);
    const res = await listInvoices(getRequest("/api/invoices", token));
    expect(res.status).toBe(403);
  });

  it("allows an ADMIN session", async () => {
    const { staff } = await createStaff();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);
    const res = await listInvoices(getRequest("/api/invoices", token));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/invoices/[id]/pdf", () => {
  it("rejects a DISPATCH session before ever reading the invoice", async () => {
    const { staff } = await createStaff({ role: "DISPATCH" });
    const token = await tokenFor(staff.id, "DISPATCH", staff.name);
    const res = await invoicePdf(getRequest("/api/invoices/nonexistent-id/pdf", token), { params: { id: "nonexistent-id" } });
    expect(res.status).toBe(403);
  });

  it("returns a PDF for an ADMIN session", async () => {
    const { staff } = await createStaff();
    const { driver } = await createDriver();
    const jobType = await createJobType();
    const business = await createBusiness();
    await createJob({ driverId: driver.id, jobTypeId: jobType.id, businessId: business.id, status: "DELIVERED", deliveredAt: IN_PERIOD });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);
    const created = await createInvoice(jsonRequest("/api/invoices", "POST", { businessId: business.id, ...PERIOD }, token));
    const { invoice } = await created.json();

    const res = await invoicePdf(getRequest(`/api/invoices/${invoice.id}/pdf`, token), { params: { id: invoice.id } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("returns 404 for a nonexistent invoice id", async () => {
    const { staff } = await createStaff();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);
    const res = await invoicePdf(getRequest("/api/invoices/nonexistent-id/pdf", token), { params: { id: "nonexistent-id" } });
    expect(res.status).toBe(404);
  });
});
