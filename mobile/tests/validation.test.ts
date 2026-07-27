import { describe, it, expect } from "vitest";
import { isValidEmail, isValidPhone } from "../src/lib/validation";

describe("isValidEmail", () => {
  it("accepts a normal email", () => {
    expect(isValidEmail("driver@example.com")).toBe(true);
  });

  it.each(["not-an-email", "missing@domain", "@no-local-part.com", "spaces in@email.com", ""])(
    "rejects %s",
    (value) => {
      expect(isValidEmail(value)).toBe(false);
    }
  );
});

describe("isValidPhone", () => {
  it.each(["+1 555 555 5555", "5555555555", "(555) 555-5555", "555-555-5555"])("accepts %s", (value) => {
    expect(isValidPhone(value)).toBe(true);
  });

  it.each([
    "call me maybe", // the exact garbage input the security audit flagged
    "123", // too short to be a real number
    "", // empty
    "1".repeat(25), // digits only, but over the 20-char length cap
  ])("rejects %s", (value) => {
    expect(isValidPhone(value)).toBe(false);
  });
});
