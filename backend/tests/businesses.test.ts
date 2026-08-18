import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
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

  // Plain z.number().positive() accepts Infinity (it's a positive number as
  // far as JS/zod are concerned) — Postgres' float8 billingRate column would
  // happily store it, silently producing an Infinity totalAmount on every
  // invoice generated for this business afterward. JSON itself can't encode
  // a literal Infinity (JSON.stringify(Infinity) serializes to "null", which
  // wouldn't exercise this at all), but a numeric literal that overflows
  // double precision — e.g. 1e400 — parses to Infinity via plain JSON.parse,
  // same as body parsing in parseBody/req.json() does here, so the request
  // body is built by hand rather than through the jsonRequest/JSON.stringify
  // helper.
  it("rejects a billingRate that overflows to Infinity", async () => {
    const { staff } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const req = new NextRequest("http://localhost:4000/api/businesses", {
      method: "POST",
      body: '{"name":"Infinite Co","billingRate":1e400}',
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const res = await createBusiness(req);
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
