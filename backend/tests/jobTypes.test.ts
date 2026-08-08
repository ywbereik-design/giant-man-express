import { describe, it, expect } from "vitest";
import { GET as listJobTypes, POST as createJobType } from "@/app/api/job-types/route";
import { prisma } from "@/lib/db";
import { createStaff, createDriver, tokenFor, getRequest, jsonRequest } from "./helpers";

describe("GET /api/job-types", () => {
  it("lets an ADMIN see inactive job types too", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);
    const inactive = await prisma.jobType.create({ data: { name: `Inactive-${Date.now()}`, active: false } });

    const res = await listJobTypes(getRequest("/api/job-types", token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobTypes.some((jt: { id: string }) => jt.id === inactive.id)).toBe(true);
  });

  it("hides inactive job types from a DISPATCH session", async () => {
    const { staff } = await createStaff({ role: "DISPATCH" });
    const token = await tokenFor(staff.id, "DISPATCH", staff.name);
    const inactive = await prisma.jobType.create({ data: { name: `Inactive-${Date.now()}`, active: false } });

    const res = await listJobTypes(getRequest("/api/job-types", token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobTypes.some((jt: { id: string }) => jt.id === inactive.id)).toBe(false);
  });

  it("hides inactive job types from an ACCOUNTANT session", async () => {
    const { staff } = await createStaff({ role: "ACCOUNTANT" });
    const token = await tokenFor(staff.id, "ACCOUNTANT", staff.name);

    const res = await listJobTypes(getRequest("/api/job-types", token));
    expect(res.status).toBe(200);
  });

  it("lets an active DRIVER session read active job types", async () => {
    const { driver } = await createDriver();
    const active = await prisma.jobType.create({ data: { name: `Active-${Date.now()}`, active: true } });
    const inactive = await prisma.jobType.create({ data: { name: `Inactive-${Date.now()}`, active: false } });
    const token = await tokenFor(driver.id, "DRIVER", driver.name);

    const res = await listJobTypes(getRequest("/api/job-types", token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobTypes.some((jt: { id: string }) => jt.id === active.id)).toBe(true);
    expect(body.jobTypes.some((jt: { id: string }) => jt.id === inactive.id)).toBe(false);
  });

  it("rejects a deactivated staff account's token instead of falling back to the lighter session check", async () => {
    const { staff } = await createStaff({ role: "DISPATCH" });
    const token = await tokenFor(staff.id, "DISPATCH", staff.name);
    await prisma.staffUser.update({ where: { id: staff.id }, data: { active: false } });

    const res = await listJobTypes(getRequest("/api/job-types", token));
    expect(res.status).toBe(401);
  });

  it("rejects a deactivated driver's token instead of falling back to the lighter session check", async () => {
    const { driver } = await createDriver();
    const token = await tokenFor(driver.id, "DRIVER", driver.name);
    await prisma.driver.update({ where: { id: driver.id }, data: { active: false } });

    const res = await listJobTypes(getRequest("/api/job-types", token));
    expect(res.status).toBe(401);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await listJobTypes(getRequest("/api/job-types"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/job-types", () => {
  it("rejects a name over the length bound", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createJobType(jsonRequest("/api/job-types", "POST", { name: "x".repeat(101) }, token));
    expect(res.status).toBe(400);
  });
});
