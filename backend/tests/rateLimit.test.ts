import { describe, it, expect } from "vitest";
import { POST as staffLogin } from "@/app/api/auth/staff/login/route";
import { createStaff, jsonRequest } from "./helpers";

// No test previously covered login rate limiting at all — this was found
// live during a production audit: 20 concurrent failed logins against one
// account all returned 401, none were blocked, because the old
// check-then-later-record design let every concurrent request read the
// same pre-increment attempt count before any of them wrote back.
describe("login rate limiting", () => {
  it("eventually blocks repeated failed logins with 429", async () => {
    const { staff } = await createStaff();

    let sawRateLimited = false;
    for (let i = 0; i < 15; i++) {
      const res = await staffLogin(
        jsonRequest("/api/auth/staff/login", "POST", { email: staff.email, password: "wrong" })
      );
      if (res.status === 429) {
        sawRateLimited = true;
        break;
      }
      expect(res.status).toBe(401);
    }
    expect(sawRateLimited).toBe(true);
  });

  it("cannot be bypassed by firing failed logins concurrently", async () => {
    const { staff } = await createStaff();

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        staffLogin(jsonRequest("/api/auth/staff/login", "POST", { email: staff.email, password: "wrong" }))
      )
    );
    const statuses = results.map((r) => r.status);
    const allowedThrough = statuses.filter((s) => s === 401).length;
    const blocked = statuses.filter((s) => s === 429).length;

    // The exact split depends on request scheduling, but the core guarantee
    // is that the atomic increment-then-check can't let every concurrent
    // attempt through the way the old read-then-later-write design did.
    expect(blocked).toBeGreaterThan(0);
    expect(allowedThrough).toBeLessThan(20);
  });
});
