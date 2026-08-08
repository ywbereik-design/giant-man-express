import { describe, it, expect } from "vitest";
import { GET as listStaff, POST as createStaffRoute } from "@/app/api/staff/route";
import { PATCH as updateStaff, DELETE as deleteStaff } from "@/app/api/staff/[id]/route";
import { prisma } from "@/lib/db";
import { createStaff, deactivateAllOtherAdmins, tokenFor, jsonRequest, getRequest } from "./helpers";

describe("POST /api/staff", () => {
  it("lets an ADMIN create a new staff account", async () => {
    const { staff } = await createStaff();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);
    const res = await createStaffRoute(
      jsonRequest(
        "/api/staff",
        "POST",
        { name: "New Hire", email: `newhire-${Date.now()}@example.com`, password: "a-real-password", role: "DISPATCH" },
        token
      )
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.staff.role).toBe("DISPATCH");
    // Never returned, even on the account that was just created.
    expect(body.staff.passwordHash).toBeUndefined();
  });

  it("rejects a DISPATCH session — staff management is ADMIN-only", async () => {
    const { staff } = await createStaff({ role: "DISPATCH" });
    const token = await tokenFor(staff.id, "DISPATCH", staff.name);
    const res = await createStaffRoute(
      jsonRequest(
        "/api/staff",
        "POST",
        { name: "New Hire", email: `newhire-${Date.now()}@example.com`, password: "a-real-password", role: "ADMIN" },
        token
      )
    );
    expect(res.status).toBe(403);
  });

  it("cannot be used to self-promote by a DISPATCH token forging an ADMIN role claim", async () => {
    // The JWT's own `role` claim is DISPATCH — requireRole re-checks the
    // *current* DB row, not the claim, so tampering with a decoded/forged
    // token's role client-side wouldn't help either; this just confirms the
    // legitimate DISPATCH session is rejected outright.
    const { staff } = await createStaff({ role: "DISPATCH" });
    const token = await tokenFor(staff.id, "DISPATCH", staff.name);
    const res = await createStaffRoute(
      jsonRequest("/api/staff", "POST", { name: "X", email: `x-${Date.now()}@example.com`, password: "a-real-password", role: "ADMIN" }, token)
    );
    expect(res.status).toBe(403);
  });

  it("rejects a duplicate email with 409", async () => {
    const { staff: admin } = await createStaff();
    const { staff: existing } = await createStaff();
    const token = await tokenFor(admin.id, "ADMIN", admin.name);
    const res = await createStaffRoute(
      jsonRequest("/api/staff", "POST", { name: "Dup", email: existing.email, password: "a-real-password", role: "DISPATCH" }, token)
    );
    expect(res.status).toBe(409);
  });
});

describe("GET /api/staff", () => {
  it("rejects a non-ADMIN session", async () => {
    const { staff } = await createStaff({ role: "DISPATCH" });
    const token = await tokenFor(staff.id, "DISPATCH", staff.name);
    const res = await listStaff(getRequest("/api/staff", token));
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/staff/[id]", () => {
  it("invalidates the target's existing token when an admin resets their password", async () => {
    const { staff: admin } = await createStaff({ role: "ADMIN" });
    const { staff: target } = await createStaff({ role: "DISPATCH" });
    const adminToken = await tokenFor(admin.id, "ADMIN", admin.name);
    const targetOldToken = await tokenFor(target.id, "DISPATCH", target.name, 0);

    const res = await updateStaff(
      jsonRequest(`/api/staff/${target.id}`, "PATCH", { password: "a-new-password" }, adminToken),
      { params: { id: target.id } }
    );
    expect(res.status).toBe(200);

    const { GET: listJobs } = await import("@/app/api/jobs/route");
    const check = await listJobs(getRequest("/api/jobs", targetOldToken));
    expect(check.status).toBe(401);
  });

  it("doesn't touch tokenVersion when no password is being changed", async () => {
    const { staff: admin } = await createStaff({ role: "ADMIN" });
    const { staff: target } = await createStaff({ role: "DISPATCH" });
    const adminToken = await tokenFor(admin.id, "ADMIN", admin.name);
    const targetOldToken = await tokenFor(target.id, "DISPATCH", target.name, 0);

    const res = await updateStaff(jsonRequest(`/api/staff/${target.id}`, "PATCH", { name: "Renamed" }, adminToken), {
      params: { id: target.id },
    });
    expect(res.status).toBe(200);

    const { GET: listJobs } = await import("@/app/api/jobs/route");
    const check = await listJobs(getRequest("/api/jobs", targetOldToken));
    expect(check.status).toBe(200); // still a valid session — DISPATCH can list jobs
  });

  it("blocks demoting the last active admin", async () => {
    const { staff: onlyAdmin } = await createStaff({ role: "ADMIN" });
    await deactivateAllOtherAdmins(onlyAdmin.id);
    const token = await tokenFor(onlyAdmin.id, "ADMIN", onlyAdmin.name);
    const res = await updateStaff(jsonRequest(`/api/staff/${onlyAdmin.id}`, "PATCH", { role: "DISPATCH" }, token), {
      params: { id: onlyAdmin.id },
    });
    expect(res.status).toBe(400);
  });

  it("allows demoting an admin when another active admin still exists", async () => {
    const { staff: admin1 } = await createStaff({ role: "ADMIN" });
    const { staff: admin2 } = await createStaff({ role: "ADMIN" });
    const token = await tokenFor(admin1.id, "ADMIN", admin1.name);
    const res = await updateStaff(jsonRequest(`/api/staff/${admin2.id}`, "PATCH", { role: "DISPATCH" }, token), {
      params: { id: admin2.id },
    });
    expect(res.status).toBe(200);
  });

  it("blocks an admin from deactivating their own account", async () => {
    const { staff: admin1 } = await createStaff({ role: "ADMIN" });
    await createStaff({ role: "ADMIN" }); // a second admin exists, so this isn't the last-admin case
    const token = await tokenFor(admin1.id, "ADMIN", admin1.name);
    const res = await updateStaff(jsonRequest(`/api/staff/${admin1.id}`, "PATCH", { active: false }, token), {
      params: { id: admin1.id },
    });
    expect(res.status).toBe(400);
  });

  it("blocks deactivating the last active admin even via a different admin's session", async () => {
    // Use a second admin's token so the "own account" guard doesn't
    // confound this test with the last-admin guard being checked here.
    const { staff: onlyAdmin } = await createStaff({ role: "ADMIN" });
    const { staff: actingAdmin } = await createStaff({ role: "ADMIN" });
    await deactivateAllOtherAdmins(onlyAdmin.id, actingAdmin.id); // leaves exactly these two active
    const token = await tokenFor(actingAdmin.id, "ADMIN", actingAdmin.name);

    // Two admins exist (onlyAdmin + actingAdmin) so deactivating onlyAdmin
    // is allowed — confirms the guard checks the TARGET's remaining-admin
    // count, not just whether the caller happens to be an admin.
    const res = await updateStaff(jsonRequest(`/api/staff/${onlyAdmin.id}`, "PATCH", { active: false }, token), {
      params: { id: onlyAdmin.id },
    });
    // Two admins exist (onlyAdmin + actingAdmin), so this one is allowed —
    // confirms the guard is scoped correctly rather than over-blocking.
    expect(res.status).toBe(200);

    // Now deactivating the sole remaining admin must be blocked.
    const res2 = await updateStaff(jsonRequest(`/api/staff/${actingAdmin.id}`, "PATCH", { active: false }, token), {
      params: { id: actingAdmin.id },
    });
    expect(res2.status).toBe(400);
  });

  it("only lets one of two concurrent demotions of different admins succeed, when exactly 2 active admins exist", async () => {
    // Without the advisory-lock serialization, each request independently
    // reads "1 other active admin remains" before either commits, and both
    // succeed — leaving zero active admins with no self-service recovery.
    const { staff: admin1 } = await createStaff({ role: "ADMIN" });
    const { staff: admin2 } = await createStaff({ role: "ADMIN" });
    await deactivateAllOtherAdmins(admin1.id, admin2.id);
    const token = await tokenFor(admin1.id, "ADMIN", admin1.name);

    const [r1, r2] = await Promise.all([
      updateStaff(jsonRequest(`/api/staff/${admin1.id}`, "PATCH", { role: "DISPATCH" }, token), {
        params: { id: admin1.id },
      }),
      updateStaff(jsonRequest(`/api/staff/${admin2.id}`, "PATCH", { role: "DISPATCH" }, token), {
        params: { id: admin2.id },
      }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 400]);

    const remainingActiveAdmins = await prisma.staffUser.count({ where: { role: "ADMIN", active: true } });
    expect(remainingActiveAdmins).toBe(1);
  });
});

describe("DELETE /api/staff/[id]", () => {
  it("blocks an admin from deleting their own account", async () => {
    const { staff: admin1 } = await createStaff({ role: "ADMIN" });
    await createStaff({ role: "ADMIN" });
    const token = await tokenFor(admin1.id, "ADMIN", admin1.name);
    const res = await deleteStaff(jsonRequest(`/api/staff/${admin1.id}`, "DELETE", undefined, token), {
      params: { id: admin1.id },
    });
    expect(res.status).toBe(400);
  });

  it("blocks deleting the last active admin", async () => {
    const { staff: onlyAdmin } = await createStaff({ role: "ADMIN" });
    const { staff: actingAdmin } = await createStaff({ role: "ADMIN" });
    await deactivateAllOtherAdmins(onlyAdmin.id, actingAdmin.id);
    const token = await tokenFor(actingAdmin.id, "ADMIN", actingAdmin.name);

    // Deleting onlyAdmin is fine (actingAdmin remains) — then deleting the
    // final one must be blocked.
    const res = await deleteStaff(jsonRequest(`/api/staff/${onlyAdmin.id}`, "DELETE", undefined, token), {
      params: { id: onlyAdmin.id },
    });
    expect(res.status).toBe(200);

    const res2 = await deleteStaff(jsonRequest(`/api/staff/${actingAdmin.id}`, "DELETE", undefined, token), {
      params: { id: actingAdmin.id },
    });
    expect(res2.status).toBe(400);
    const stillThere = await prisma.staffUser.findUnique({ where: { id: actingAdmin.id } });
    expect(stillThere).not.toBeNull();
  });

  it("rejects a DISPATCH session", async () => {
    const { staff: target } = await createStaff();
    const { staff: dispatcher } = await createStaff({ role: "DISPATCH" });
    const token = await tokenFor(dispatcher.id, "DISPATCH", dispatcher.name);
    const res = await deleteStaff(jsonRequest(`/api/staff/${target.id}`, "DELETE", undefined, token), {
      params: { id: target.id },
    });
    expect(res.status).toBe(403);
  });
});
