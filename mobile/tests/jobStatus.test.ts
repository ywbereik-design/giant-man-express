import { describe, it, expect } from "vitest";
import { photoCaption } from "../src/lib/jobStatus";

describe("photoCaption", () => {
  it("formats coordinates and a readable timestamp when all fields are present", () => {
    const caption = photoCaption(45.123456, -73.654321, "2026-01-15T14:30:00.000Z");
    expect(caption).toContain("45.12346");
    expect(caption).toContain("-73.65432");
  });

  it("returns undefined when lat is missing", () => {
    expect(photoCaption(null, -73.6, "2026-01-15T14:30:00.000Z")).toBeUndefined();
  });

  it("returns undefined when lng is missing", () => {
    expect(photoCaption(45.1, null, "2026-01-15T14:30:00.000Z")).toBeUndefined();
  });

  it("returns undefined when the timestamp is missing", () => {
    expect(photoCaption(45.1, -73.6, null)).toBeUndefined();
  });

  it("returns undefined when every field is missing", () => {
    expect(photoCaption(null, null, null)).toBeUndefined();
  });

  it("handles (0, 0) coordinates correctly — not treated as falsy/missing", () => {
    // Off the coast of Africa, but a legitimate value — `lat == null` must
    // be checked with ==/!= against null specifically, not truthiness,
    // or (0, 0) would be silently dropped like a real missing value.
    expect(photoCaption(0, 0, "2026-01-15T14:30:00.000Z")).toBeDefined();
  });
});
