import { describe, it, expect } from "vitest";
import { hasValidImageMagicBytes } from "../src/lib/imageValidation";

function dataUrl(mime: string, bytes: number[]): string {
  return `data:image/${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

describe("hasValidImageMagicBytes", () => {
  it("accepts a real JPEG header", () => {
    expect(hasValidImageMagicBytes(dataUrl("jpeg", [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe(true);
  });

  it("accepts a real PNG header", () => {
    expect(hasValidImageMagicBytes(dataUrl("png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  });

  it("accepts a real WebP header", () => {
    const riffWebp = [
      0x52, 0x49, 0x46, 0x46, // RIFF
      0, 0, 0, 0, // size (unchecked)
      0x57, 0x45, 0x42, 0x50, // WEBP
    ];
    expect(hasValidImageMagicBytes(dataUrl("webp", riffWebp))).toBe(true);
  });

  it("rejects a PNG-labeled payload whose bytes are actually a JPEG", () => {
    expect(hasValidImageMagicBytes(dataUrl("png", [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe(false);
  });

  it("rejects a data URL whose payload is plain text, not image bytes at all", () => {
    const text = Buffer.from("not an image").toString("base64");
    expect(hasValidImageMagicBytes(`data:image/jpeg;base64,${text}`)).toBe(false);
  });

  it("rejects a truncated payload too short to contain any real header", () => {
    expect(hasValidImageMagicBytes(dataUrl("png", [0x89]))).toBe(false);
  });

  it("rejects a string that isn't a data URL at all", () => {
    expect(hasValidImageMagicBytes("not-a-data-url")).toBe(false);
  });
});
