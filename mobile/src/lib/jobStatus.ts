import { Job, JobStatus } from "../api/types";

// A job that's been accepted but not yet finished — actively being worked
// on right now. Same membership wherever "currently in progress" matters:
// which job needs routing (routeDestination, DriverLiveMap) and which can
// still be marked FAILED (driver JobsScreen's canFail) share this exact
// set, even though each uses it for a different purpose.
export const IN_PROGRESS_STATUSES: JobStatus[] = ["ACCEPTED", "ARRIVED", "PICKED_UP", "ON_THE_WAY"];

// A job can be marked failed from any stage before it's actually
// delivered — mirrors DRIVER_ALLOWED_TRANSITIONS on the backend. Shared by
// the driver job list's per-card action and the Job Details screen's
// always-visible "Mark Failed" button.
export function canFail(status: JobStatus): boolean {
  return IN_PROGRESS_STATUSES.includes(status);
}

// The full post-acceptance lifecycle, in order — drives the Job Details
// screen's progress stepper. Doesn't include ASSIGNED (not yet accepted,
// handled separately by SwipeToAccept) or the terminal DELIVERED/FAILED/
// CANCELLED states.
export const LIFECYCLE_STEPS: { status: JobStatus; label: string }[] = [
  { status: "ACCEPTED", label: "On the way to Pickup" },
  { status: "ARRIVED", label: "Arrived at Pickup" },
  { status: "PICKED_UP", label: "Picked Up" },
  { status: "ON_THE_WAY", label: "On the way to Dropoff" },
  { status: "DELIVERED", label: "Delivered" },
];

export const STATUS_TONE: Record<JobStatus, "info" | "success" | "danger" | "muted"> = {
  ASSIGNED: "info",
  ACCEPTED: "info",
  ARRIVED: "info",
  PICKED_UP: "info",
  ON_THE_WAY: "info",
  DELIVERED: "success",
  CANCELLED: "muted",
  FAILED: "danger",
};

// Stage timestamps shown on a job card, in order — only the ones the job has
// actually reached are rendered by callers.
export const STAGE_TIMESTAMPS: { field: keyof Job; label: string }[] = [
  { field: "acceptedAt", label: "Accepted" },
  { field: "arrivedAt", label: "Arrived" },
  { field: "pickedUpAt", label: "Picked up" },
  { field: "onTheWayAt", label: "On the way" },
  { field: "deliveredAt", label: "Delivered" },
];

// Whether a job has reached any stage worth showing a badge for — lets a
// caller decide up front whether to render a wrapping section (e.g. a Card
// titled "Progress") without needing the full filtered list itself.
export function hasReachedAnyStage(job: Job): boolean {
  return STAGE_TIMESTAMPS.some((s) => job[s.field]);
}

// GPS + server timestamp captured with a proof photo, formatted for the
// PhotoThumbnail viewer's overlay caption — verification info shown
// alongside the photo, not burned into it.
export function photoCaption(lat: number | null, lng: number | null, at: string | null): string | undefined {
  if (lat == null || lng == null || !at) return undefined;
  const when = new Date(at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
  return `${lat.toFixed(5)}, ${lng.toFixed(5)} · ${when}`;
}
