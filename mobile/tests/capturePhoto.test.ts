import { describe, it, expect, vi, beforeEach } from "vitest";

const requestCameraPermissionsAsync = vi.fn();
const launchCameraAsync = vi.fn();
vi.mock("expo-image-picker", () => ({
  CameraType: { back: "back", front: "front" },
  requestCameraPermissionsAsync: (...args: unknown[]) => requestCameraPermissionsAsync(...args),
  launchCameraAsync: (...args: unknown[]) => launchCameraAsync(...args),
}));

const manipulate = vi.fn();
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: (...args: unknown[]) => manipulate(...args) },
  SaveFormat: { JPEG: "jpeg" },
}));

import { capturePhoto, base64ByteSize, COMPRESSION_STEPS, TARGET_MAX_BYTES } from "../src/lib/capturePhoto";

// Each call to ImageManipulator.manipulate() returns a fresh context whose
// eventual saveAsync() resolves to the next entry in this queue, in order —
// mirrors the real API's per-step re-manipulate-from-source pattern.
function queueManipulatorResults(base64Sequence: (string | undefined)[]) {
  let call = 0;
  manipulate.mockImplementation(() => {
    const base64 = base64Sequence[call++];
    return {
      resize: vi.fn(),
      renderAsync: vi.fn().mockResolvedValue({
        saveAsync: vi.fn().mockResolvedValue({ base64 }),
      }),
    };
  });
}

function bigBase64(): string {
  // Decodes to well over the 500KB ceiling.
  return Buffer.alloc(TARGET_MAX_BYTES + 100_000, 1).toString("base64");
}

function smallBase64(): string {
  return Buffer.alloc(1000, 1).toString("base64");
}

beforeEach(() => {
  requestCameraPermissionsAsync.mockReset().mockResolvedValue({ status: "granted" });
  launchCameraAsync.mockReset().mockResolvedValue({ canceled: false, assets: [{ uri: "file://fake.jpg" }] });
  manipulate.mockReset();
});

describe("base64ByteSize", () => {
  it.each([0, 1, 2, 3, 4, 100, 1023, 1024, 500_000])("matches Buffer's real byte length for a %i-byte input", (byteLength) => {
    const buf = Buffer.alloc(byteLength, 7);
    expect(base64ByteSize(buf.toString("base64"))).toBe(byteLength);
  });
});

describe("capturePhoto", () => {
  it("throws if camera permission is denied, without ever launching the camera", async () => {
    requestCameraPermissionsAsync.mockResolvedValue({ status: "denied" });
    await expect(capturePhoto("back" as never)).rejects.toThrow("Camera permission is required");
    expect(launchCameraAsync).not.toHaveBeenCalled();
  });

  it("returns null (not an error) when the user cancels the camera", async () => {
    launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });
    const result = await capturePhoto("back" as never);
    expect(result).toBeNull();
    expect(manipulate).not.toHaveBeenCalled();
  });

  it("stops at the first step that lands under the size ceiling", async () => {
    queueManipulatorResults([smallBase64(), bigBase64()]);
    const result = await capturePhoto("back" as never);
    expect(manipulate).toHaveBeenCalledTimes(1);
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("keeps trying subsequent steps until one lands under the ceiling", async () => {
    queueManipulatorResults([bigBase64(), bigBase64(), smallBase64()]);
    const result = await capturePhoto("back" as never);
    expect(manipulate).toHaveBeenCalledTimes(3);
    const encoded = result!.slice("data:image/jpeg;base64,".length);
    expect(base64ByteSize(encoded)).toBeLessThanOrEqual(TARGET_MAX_BYTES);
  });

  it("falls back to the last attempt's output if every step stays over the ceiling", async () => {
    queueManipulatorResults(COMPRESSION_STEPS.map(() => bigBase64()));
    const result = await capturePhoto("back" as never);
    expect(manipulate).toHaveBeenCalledTimes(COMPRESSION_STEPS.length);
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("throws a distinct, actionable error if every step fails to produce any output at all", async () => {
    queueManipulatorResults(COMPRESSION_STEPS.map(() => undefined));
    await expect(capturePhoto("back" as never)).rejects.toThrow("Could not process the photo");
  });
});
