// IMAGE_DATA_URL_PATTERN (see constants.ts) only checks the data URL's own
// "data:image/xxx;base64," prefix string — a client can set that prefix to
// anything regardless of what bytes actually follow it. This decodes just
// enough of the payload to check the file's real magic-byte signature
// against the MIME type it claims, so a mislabeled or corrupt upload is
// rejected before it's ever persisted and later rendered.
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export function hasValidImageMagicBytes(dataUrl: string): boolean {
  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
  if (!match) return false;
  const [, subtype, base64] = match;

  // 12 real bytes (enough for the longest signature checked below, WebP's
  // RIFF....WEBP) needs at most ceil(12/3)*4 = 16 base64 characters.
  let head: Buffer;
  try {
    head = Buffer.from(base64.slice(0, 16), "base64");
  } catch {
    return false;
  }
  if (head.length < 3) return false;

  if (subtype === "jpeg" || subtype === "jpg") return head.subarray(0, 3).equals(JPEG_MAGIC);
  if (subtype === "png") return head.length >= 4 && head.subarray(0, 4).equals(PNG_MAGIC);
  if (subtype === "webp") {
    return (
      head.length >= 12 &&
      head.subarray(0, 4).toString("ascii") === "RIFF" &&
      head.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}
