export const JOB_STATUSES = [
  "ASSIGNED",
  "ACCEPTED",
  "ARRIVED",
  "PICKED_UP",
  "ON_THE_WAY",
  "DELIVERED",
  "CANCELLED",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const INVOICE_STATUSES = ["DRAFT", "FINAL"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// The driver-facing progress flow, one step at a time, from their app.
export const DRIVER_ALLOWED_TRANSITIONS: Record<string, JobStatus[]> = {
  ASSIGNED: ["ACCEPTED"],
  ACCEPTED: ["ARRIVED"],
  ARRIVED: ["PICKED_UP"],
  PICKED_UP: ["ON_THE_WAY"],
  ON_THE_WAY: ["DELIVERED"],
};

// Cap on a selfie's data-URL length — well above what a client-side-
// compressed photo should ever produce, just a sanity bound against a
// broken/huge upload. Shared by every endpoint that accepts a selfie.
export const MAX_SELFIE_DATA_URL_LENGTH = 3_000_000;

// A clock-in selfie stops being shown to admin/dispatch after this long —
// it's meant as "who's on shift right now", not an indefinite record, so a
// shift that's run unusually long (or was never clocked out) shows as
// expired rather than a stale photo.
export const SHIFT_PHOTO_EXPIRY_MS = 12 * 60 * 60 * 1000;
