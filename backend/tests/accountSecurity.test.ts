import { describe, it, expect } from "vitest";
import { PATCH as changePassword } from "@/app/api/account/password/route";
import { PATCH as changePin } from "@/app/api/account/pin/route";
import { prisma } from "@/lib/db";
import { createStaff, createDriver, tokenFor, jsonRequest } from "./helpers";

describe("PATCH /api/account/password", () => {
  it("changes the password and returns a fresh token when the current password is correct", async () => {
    const { staff, password } = await createStaff();
    const token = await tokenFor(staff.id, "ADMIN", staff.name, staff.tokenVersion);

    const res = await changePassword(
      jsonRequest("/api/account/password", "PATCH", { currentPassword: password, newPassword: "a-new-real-password" }, token)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTruthy();

    const updated = await prisma.staffUser.findUnique({ where: { id: staff.id } });
    // tokenVersion bumped — invalidates every token issued before this
    // change, including the one this very request used.
    expect(updated?.tokenVersion).toBe(staff.tokenVersion + 1);
  });

  it("rejects the wrong current password with 400, not 401 (session stays valid)", async () => {
    const { staff } = await createStaff();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);

    const res = await changePassword(
      jsonRequest("/api/account/password", "PATCH", { currentPassword: "totally-wrong", newPassword: "a-new-real-password" }, token)
    );
    expect(res.status).toBe(400);

    const unchanged = await prisma.staffUser.findUnique({ where: { id: staff.id } });
    expect(unchanged?.tokenVersion).toBe(0);
  });

  it("rejects a new password under 8 characters", async () => {
    const { staff, password } = await createStaff();
    const token = await tokenFor(staff.id, "ADMIN", staff.name);
    const res = await changePassword(
      jsonRequest("/api/account/password", "PATCH", { currentPassword: password, newPassword: "short" }, token)
    );
    expect(res.status).toBe(400);
  });

  it("an old token (pre-change tokenVersion) is rejected after the password changes", async () => {
    const { staff, password } = await createStaff();
    const oldToken = await tokenFor(staff.id, "ADMIN", staff.name, staff.tokenVersion);

    const changeRes = await changePassword(
      jsonRequest("/api/account/password", "PATCH", { currentPassword: password, newPassword: "a-new-real-password" }, oldToken)
    );
    expect(changeRes.status).toBe(200);

    // Simulate a second, already-issued copy of the old token (e.g. a
    // second device) trying to use the password route again — it should no
    // longer be accepted, since tokenVersion moved on.
    const staleAttempt = await changePassword(
      jsonRequest("/api/account/password", "PATCH", { currentPassword: "a-new-real-password", newPassword: "yet-another-one" }, oldToken)
    );
    expect(staleAttempt.status).toBe(401);
  });
});

describe("PATCH /api/account/pin", () => {
  it("changes the PIN and returns a fresh token when the current PIN is correct", async () => {
    const { driver, pin } = await createDriver();
    const token = await tokenFor(driver.id, "DRIVER", driver.name, driver.tokenVersion);

    const res = await changePin(jsonRequest("/api/account/pin", "PATCH", { currentPin: pin, newPin: "5678" }, token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTruthy();

    const updated = await prisma.driver.findUnique({ where: { id: driver.id } });
    expect(updated?.tokenVersion).toBe(driver.tokenVersion + 1);
  });

  it("rejects the wrong current PIN with 400", async () => {
    const { driver } = await createDriver({ pin: "1111" });
    const token = await tokenFor(driver.id, "DRIVER", driver.name);
    const res = await changePin(jsonRequest("/api/account/pin", "PATCH", { currentPin: "0000", newPin: "2222" }, token));
    expect(res.status).toBe(400);
  });

  it("rejects a non-numeric new PIN", async () => {
    const { driver, pin } = await createDriver();
    const token = await tokenFor(driver.id, "DRIVER", driver.name);
    const res = await changePin(jsonRequest("/api/account/pin", "PATCH", { currentPin: pin, newPin: "abcd" }, token));
    expect(res.status).toBe(400);
  });

  it("rejects a deactivated driver even with the correct current PIN", async () => {
    const { driver, pin } = await createDriver({ active: false });
    const token = await tokenFor(driver.id, "DRIVER", driver.name);
    const res = await changePin(jsonRequest("/api/account/pin", "PATCH", { currentPin: pin, newPin: "9999" }, token));
    expect(res.status).toBe(401);
  });
});
