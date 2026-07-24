import { Job, JobStatus } from "../api/types";

export const STATUS_TONE: Record<JobStatus, "info" | "success" | "danger" | "muted"> = {
  ASSIGNED: "info",
  ACCEPTED: "info",
  ARRIVED: "info",
  PICKED_UP: "info",
  ON_THE_WAY: "info",
  DELIVERED: "success",
  CANCELLED: "muted",
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
