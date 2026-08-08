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
  "Client Rescheduled",
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

// Restricts every photo upload (clock-in selfie, pickup/delivery proof) to
// the raster formats capturePhoto.ts actually produces (JPEG). Deliberately
// narrower than a bare "data:image/" prefix check, which would also accept
// e.g. "data:image/svg+xml" — an SVG can embed a script (onload, <script>)
// that executes if ever rendered in an HTML context instead of a raster
// <Image>, and a bare MIME-prefix check has no way to catch that.
export const IMAGE_DATA_URL_PATTERN = /^data:image\/(jpeg|jpg|png|webp);base64,/;

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

// Generous but bounded lengths for dispatcher-entered free text on a Job.
// title specifically gets embedded verbatim into generated invoice PDFs (see
// the line-item description built in /api/invoices) — notes/addresses aren't
// rendered into any PDF today, but all of them share this bound since an
// unbounded string or stop-address array is still a resource-exhaustion
// vector reachable by any ADMIN/DISPATCH account, not just a data-quality
// issue.
export const MAX_JOB_TEXT_LENGTH = 300;
export const MAX_JOB_NOTES_LENGTH = 2000;
export const MAX_DROPOFF_STOPS = 50;

// Same reasoning as MAX_JOB_TEXT_LENGTH, applied to the other admin-entered
// free text that ends up in the system: Business name/contactName/address
// (name and address are embedded verbatim into invoice PDFs — see
// InvoiceDocument's "Bill To" block) and JobType name (embedded into invoice
// line-item descriptions alongside Job.title).
export const MAX_BUSINESS_TEXT_LENGTH = 300;
export const MAX_JOB_TYPE_NAME_LENGTH = 100;

// Caller-supplied billing/report windows (invoice generation, hours-by-
// business) had no upper bound — a multi-year periodStart/periodEnd pulls
// every matching job into memory in one unbounded query. 366 days (not 365,
// to not reject a plain "last calendar year" range across a leap year)
// covers every real billing cycle this app actually needs; anything longer
// should be run as several smaller requests instead.
export const MAX_BILLING_PERIOD_DAYS = 366;
