import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat, type ImageRef } from "expo-image-manipulator";

export const TARGET_MAX_BYTES = 500 * 1024;

// Quality/width pairs tried in order, most detail-preserving first, until
// the encoded photo lands at or under the 500KB ceiling — stepping quality
// down before width, since a slightly softer JPEG is less noticeable on a
// phone screen than a smaller image. A plain, low-detail photo may land
// under 200KB even on the first step; that's fine — the floor is a rough
// target, not something worth upscaling or over-compressing to hit.
export const COMPRESSION_STEPS: { width: number; compress: number }[] = [
  { width: 1024, compress: 0.7 },
  { width: 1024, compress: 0.55 },
  { width: 1024, compress: 0.4 },
  { width: 800, compress: 0.4 },
  { width: 800, compress: 0.3 },
  { width: 600, compress: 0.3 },
];

// 4 base64 chars encode 3 bytes; strip padding for an exact byte count.
// Exported for direct unit testing — the padding-aware math here is the
// most bug-prone part of the compression loop (an off-by-one here would
// silently pick the wrong step every time).
export function base64ByteSize(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

// Takes a photo and compresses it down to ~200KB-500KB — small enough to
// upload quickly and store inline (including while queued offline, see
// offlineQueue.ts) without visibly degrading the proof-of-pickup/delivery
// detail. Returns null if the user backs out of the camera (not an error,
// just no photo taken). Shared by the clock-in selfie (front camera) and
// pickup/delivery proof photos (back camera).
export async function capturePhoto(cameraType: ImagePicker.CameraType): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("Camera permission is required");
  }

  const result = await ImagePicker.launchCameraAsync({ cameraType, quality: 0.9 });
  if (result.canceled || !result.assets?.[0]) return null;
  const sourceUri = result.assets[0].uri;

  // Decoding + resizing the original capture (often 10+ megapixels) is the
  // expensive part of each step; re-encoding an already-resized image at a
  // different JPEG quality is comparatively cheap. COMPRESSION_STEPS repeats
  // the same width across several quality levels before shrinking further,
  // so resizing fresh from sourceUri on every step (as this used to do) redid
  // that expensive decode+resize 2-3x for widths that hadn't changed — the
  // main source of the multi-second delay drivers hit on Picked Up/Delivered.
  // Rendering once per distinct width and calling saveAsync() again on that
  // same ImageRef for each quality at that width cuts the resize count from
  // up to 6 down to at most 3.
  let last: string | null = null;
  let renderedWidth: number | null = null;
  let rendered: ImageRef | null = null;
  outer: for (const step of COMPRESSION_STEPS) {
    if (renderedWidth !== step.width) {
      const context = ImageManipulator.manipulate(sourceUri);
      context.resize({ width: step.width });
      rendered = await context.renderAsync();
      renderedWidth = step.width;
    }
    const saved = await rendered!.saveAsync({ format: SaveFormat.JPEG, compress: step.compress, base64: true });
    if (!saved.base64) continue;

    last = saved.base64;
    if (base64ByteSize(saved.base64) <= TARGET_MAX_BYTES) break outer;
  }

  // A photo WAS taken (the cancel case already returned above) but every
  // compression attempt failed to produce output — a real processing
  // failure, not "no photo taken". Throwing here (rather than also
  // returning null) lets callers show an actual error instead of the
  // misleading "a photo is required" message they show for a genuine cancel.
  if (!last) throw new Error("Could not process the photo. Please try again.");
  return `data:image/jpeg;base64,${last}`;
}
