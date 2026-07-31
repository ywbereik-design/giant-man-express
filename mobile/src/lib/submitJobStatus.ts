import { api, ApiError } from "../api/client";
import { enqueueJobUpdate } from "./offlineQueue";
import { FailureReason, Job, JobStatus } from "../api/types";

export interface JobStatusExtra {
  photo?: string;
  lat?: number;
  lng?: number;
  failureReason?: FailureReason;
}

export interface SubmitJobStatusResult {
  // false means "not sent — queued for automatic retry", not a failure.
  sent: boolean;
  job?: Job;
}

// Sends a driver job-status update, and on a network failure (not a
// rejection) queues it for automatic retry instead of surfacing a hard
// error. Shared by every screen that can change a job's status (the job
// list's per-card actions/batch updates, and the Job Details screen's
// swipe-to-accept) so the offline behavior is identical everywhere rather
// than reimplemented per screen.
export async function submitJobStatus(
  jobId: string,
  status: JobStatus,
  extra: JobStatusExtra = {}
): Promise<SubmitJobStatusResult> {
  try {
    const res = await api.patch<{ job: Job }>(`/api/driver/jobs/${jobId}/status`, { status, ...extra });
    return { sent: true, job: res.job };
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) {
      enqueueJobUpdate({ jobId, status, ...extra });
      return { sent: false };
    }
    throw e;
  }
}
