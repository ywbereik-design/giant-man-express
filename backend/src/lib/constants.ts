export const JOB_STATUSES = [
  "ASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const INVOICE_STATUSES = ["DRAFT", "FINAL"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// Order a driver is allowed to move a job through from their app.
export const DRIVER_ALLOWED_TRANSITIONS: Record<string, JobStatus[]> = {
  ASSIGNED: ["ACCEPTED"],
  ACCEPTED: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
};
