import { describe, it, expect } from "vitest";
import { POST as staffLogin } from "@/app/api/auth/staff/login/route";
import { POST as driverLogin } from "@/app/api/auth/driver/login/route";
import { createStaff, createDriver, jsonRequest } from "./helpers";

describe("POST /api/auth/staff/login", () => {
  it("logs in with correct credentials and returns a role-scoped token", async () => {
    const { staff, password } = await createStaff({ role: "DISPATCH" });
    const res = await staffLogin(jsonRequest("/api/auth/staff/login", "POST", { email: staff.email, password }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("DISPATCH");
    expect(body.token).toBeTruthy();
  });

  it("rejects a wrong password without revealing whether the account exists", async () => {
    const { staff } = await createStaff();
    const res = await staffLogin(
      jsonRequest("/api/auth/staff/login", "POST", { email: staff.email, password: "wrong-password" })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid email or password");
  });

  it("rejects a deactivated account even with the correct password", async () => {
    const { staff, password } = await createStaff({ active: false });
    const res = await staffLogin(jsonRequest("/api/auth/staff/login", "POST", { email: staff.email, password }));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown email with the same error as a wrong password", async () => {
    const res = await staffLogin(
      jsonRequest("/api/auth/staff/login", "POST", { email: "nobody@example.com", password: "whatever" })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid email or password");
  });
});

describe("POST /api/auth/driver/login", () => {
  it("logs in with the correct employee code and PIN", async () => {
    const { driver, pin } = await createDriver();
    const res = await driverLogin(
      jsonRequest("/api/auth/driver/login", "POST", { employeeCode: driver.employeeCode, pin })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("DRIVER");
    expect(body.token).toBeTruthy();
  });

  it("rejects a wrong PIN", async () => {
    const { driver } = await createDriver({ pin: "9999" });
    const res = await driverLogin(
      jsonRequest("/api/auth/driver/login", "POST", { employeeCode: driver.employeeCode, pin: "0000" })
    );
    expect(res.status).toBe(401);
  });

  it("rejects a deactivated driver even with the correct PIN", async () => {
    const { driver, pin } = await createDriver({ active: false });
    const res = await driverLogin(
      jsonRequest("/api/auth/driver/login", "POST", { employeeCode: driver.employeeCode, pin })
    );
    expect(res.status).toBe(401);
  });
});
