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

  it("uppercases the code and returns it", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createBusiness(
      jsonRequest("/api/businesses", "POST", { name: "Acme Co", code: `acme-${Date.now()}` }, token)
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.business.code).toBe(body.business.code.toUpperCase());
  });

  it("rejects a duplicate code", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);
    const code = `DUP-${Date.now()}`;

    const first = await createBusiness(jsonRequest("/api/businesses", "POST", { name: "First", code }, token));
    expect(first.status).toBe(201);

    const second = await createBusiness(jsonRequest("/api/businesses", "POST", { name: "Second", code }, token));
    expect(second.status).toBe(409);
  });

  it("allows any number of businesses with no code set", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const first = await createBusiness(jsonRequest("/api/businesses", "POST", { name: "No Code One" }, token));
    const second = await createBusiness(jsonRequest("/api/businesses", "POST", { name: "No Code Two" }, token));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it("defaults billingType to PER_TRIP when not set", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createBusiness(jsonRequest("/api/businesses", "POST", { name: "Default Billing" }, token));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.business.billingType).toBe("PER_TRIP");
  });

  it("accepts PER_HOUR and FLAT_RATE billingType", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const hourly = await createBusiness(
      jsonRequest("/api/businesses", "POST", { name: "Hourly Co", billingType: "PER_HOUR" }, token)
    );
    expect(hourly.status).toBe(201);
    expect((await hourly.json()).business.billingType).toBe("PER_HOUR");

    const flat = await createBusiness(
      jsonRequest("/api/businesses", "POST", { name: "Flat Co", billingType: "FLAT_RATE" }, token)
    );
    expect(flat.status).toBe(201);
    expect((await flat.json()).business.billingType).toBe("FLAT_RATE");
  });

  it("rejects an invalid billingType", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await createBusiness(
      jsonRequest("/api/businesses", "POST", { name: "Bad Billing", billingType: "PER_MONTH" }, token)
    );
    expect(res.status).toBe(400);
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

  it("sets a code, then clears it back to null with an empty string", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const business = await createBusinessRow();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const setRes = await updateBusiness(
      jsonRequest(`/api/businesses/${business.id}`, "PATCH", { code: `set-${Date.now()}` }, token),
      { params: { id: business.id } }
    );
    expect(setRes.status).toBe(200);
    const setBody = await setRes.json();
    expect(setBody.business.code).toBe(setBody.business.code.toUpperCase());

    const clearRes = await updateBusiness(
      jsonRequest(`/api/businesses/${business.id}`, "PATCH", { code: "" }, token),
      { params: { id: business.id } }
    );
    expect(clearRes.status).toBe(200);
    const clearBody = await clearRes.json();
    expect(clearBody.business.code).toBeNull();
  });

  it("changes billingType from the default PER_TRIP to FLAT_RATE", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const business = await createBusinessRow();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await updateBusiness(
      jsonRequest(`/api/businesses/${business.id}`, "PATCH", { billingType: "FLAT_RATE" }, token),
      { params: { id: business.id } }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).business.billingType).toBe("FLAT_RATE");
  });
});
