import { describe, it, expect } from "vitest";
import { POST as createBusiness } from "@/app/api/businesses/route";
import { PATCH as updateBusiness } from "@/app/api/businesses/[id]/route";
import { createStaff, createBusiness as createBusinessRow, tokenFor, jsonRequest } from "./helpers";

describe("POST /api/businesses", () => {
  it("rejects a name over the length bound", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createBusiness(jsonRequest("/api/businesses", "POST", { name: "x".repeat(301) }, token));
    expect(res.status).toBe(400);
  });

  it("accepts a name at the length bound", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createBusiness(jsonRequest("/api/businesses", "POST", { name: "x".repeat(300) }, token));
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/businesses/[id]", () => {
  it("rejects an address over the length bound", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const business = await createBusinessRow();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await updateBusiness(
      jsonRequest(`/api/businesses/${business.id}`, "PATCH", { address: "x".repeat(301) }, token),
      { params: { id: business.id } }
    );
    expect(res.status).toBe(400);
  });
});
