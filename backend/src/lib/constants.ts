export const JOB_STATUSES = [
  "ASSIGNED",
  "ACCEPTED",
  "ARRIVED",
  "PICKED_UP",
  "ON_THE_WAY",
  "DELIVERED",
  "CANCELLED",
  "FAILED",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const INVOICE_STATUSES = ["DRAFT", "FINAL"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// The driver-facing progress flow, one step at a time, from their app. Every
// in-flight stage (everything but ASSIGNED, before the driver has even
// accepted) also allows a same-step jump straight to FAILED — a delivery
// attempt can go wrong at any of those points, not just at the final stop.
export const DRIVER_ALLOWED_TRANSITIONS: Record<string, JobStatus[]> = {
  ASSIGNED: ["ACCEPTED"],
  ACCEPTED: ["ARRIVED", "FAILED"],
  ARRIVED: ["PICKED_UP", "FAILED"],
  PICKED_UP: ["ON_THE_WAY", "FAILED"],
  ON_THE_WAY: ["DELIVERED", "FAILED"],
};

// Fixed, required reasons a driver must choose from when marking a job
// FAILED — kept as a closed list (rather than free text) so admin/dispatch
// reporting on failed deliveries stays consistent.
export const FAILURE_REASONS = [
  "No Answer",
  "Incorrect Address",
  "Customer Rescheduled",
  "Location Closed",
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

// Statuses a batch update can move multiple jobs into at once — deliberately
// excludes PICKED_UP/DELIVERED (each requires its own proof photo, which a
// bulk action has no per-job UI for) and FAILED (requires a per-job reason).
export const BATCH_ALLOWED_STATUSES = ["ACCEPTED", "ARRIVED", "ON_THE_WAY"] as const;

// Cap on a selfie's data-URL length — well above what a client-side-
// compressed photo should ever produce, just a sanity bound against a
// broken/huge upload. Shared by every endpoint that accepts a selfie.
export const MAX_SELFIE_DATA_URL_LENGTH = 3_000_000;

// A clock-in selfie stops being shown to admin/dispatch after this long —
// it's meant as "who's on shift right now", not an indefinite record, so a
// shift that's run unusually long (or was never clocked out) shows as
// expired rather than a stale photo.
export const SHIFT_PHOTO_EXPIRY_MS = 12 * 60 * 60 * 1000;

// Loose on purpose (digits, spaces, and the usual phone punctuation) — this
// is a dispatcher-entered contact number, not a strictly validated E.164
// value, but it should at least contain a few digits rather than accepting
// arbitrary text that would make the driver's Call/WhatsApp buttons dial junk.
export const PHONE_PATTERN = /^[\d+()\-.\s]{7,20}$/;
