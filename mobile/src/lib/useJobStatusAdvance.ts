import { useCallback, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { ApiError } from "../api/client";
import { FailureReason, Job, JobStatus } from "../api/types";
import { capturePhoto } from "./capturePhoto";
import { getCoords } from "./getCoords";
import { getQueuedJobIds } from "./offlineQueue";
import { submitJobStatus } from "./submitJobStatus";

// The label shown on the button that advances a job OUT of its current
// status, and the status that press lands it on. A status's label names
// the milestone the driver is heading toward next ("Arrived at Pickup"),
// not the status it's already in — matches getLifecycleSteps in
// jobStatus.ts, whose step N is the status this function's step N-1
// advances into. A job with no pickup address skips ARRIVED/PICKED_UP
// entirely — ACCEPTED goes straight to "On the way to Dropoff" — mirroring
// the backend's additive ACCEPTED -> ON_THE_WAY allowance in the status
// route when job.pickupAddress is null.
export function getNextAction(job: Job): { label: string; next: JobStatus } | undefined {
  switch (job.status) {
    case "ASSIGNED":
      return { label: "Accept Job", next: "ACCEPTED" };
    case "ACCEPTED":
      return job.pickupAddress
        ? { label: "Arrived at Pickup", next: "ARRIVED" }
        : { label: "On the way to Dropoff", next: "ON_THE_WAY" };
    case "ARRIVED":
      return { label: "Picked Up", next: "PICKED_UP" };
    case "PICKED_UP":
      return { label: "On the way to Dropoff", next: "ON_THE_WAY" };
    case "ON_THE_WAY":
      return { label: "Delivered", next: "DELIVERED" };
    default:
      return undefined;
  }
}

// Photos are required proof at these two specific transitions — mirrors the
// clock-in selfie requirement, but with the rear camera (photo of the
// package/location, not the driver).
const PHOTO_REQUIRED_ON: Partial<Record<JobStatus, true>> = {
  PICKED_UP: true,
  DELIVERED: true,
};

// A pickup photo only makes sense as proof against an actual pickup
// location — if dispatch never set one on the job, there's nothing to
// prove a pickup happened at, so the driver can advance straight through
// without the camera prompt. Delivery photos stay unconditionally required
// (every job has at least one dropoff stop). Mirrors the backend's own
// conditional check in /api/driver/jobs/[id]/status.
function isPhotoRequired(nextStatus: JobStatus, job: Job): boolean {
  if (nextStatus === "PICKED_UP") return Boolean(job.pickupAddress);
  return Boolean(PHOTO_REQUIRED_ON[nextStatus]);
}

// Drives a job through Accept -> ... -> Delivered (or Mark Failed at any
// in-progress stage), including the pickup/delivery photo prompt and the
// offline-queue fallback. Shared by the driver job list's per-card actions
// and the Job Details screen's full-lifecycle view so both behave
// identically — same photo-retry cache, same offline handling — instead of
// two parallel implementations that could drift apart.
export function useJobStatusAdvance(onUpdated: (job: Job) => void) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queuedIds, setQueuedIds] = useState<Set<string>>(() => getQueuedJobIds());
  const [failingJob, setFailingJob] = useState<Job | null>(null);

  // Holds a just-captured photo/coords across a failed submit attempt so a
  // retry doesn't force the driver back through the camera — capturePhoto()
  // is slow enough on its own (a real photo, resized/compressed at up to 3
  // quality steps) that discarding it on every transient submit error (a
  // slow connection, a 409 from another device having already moved the
  // job on) and forcing a full recapture was the actual "delay, then need
  // to take another photo" complaint. Keyed by job+target status so it's
  // never reused for the wrong job or a since-changed transition; cleared
  // once the attempt is actually handed off (sent live or queued offline).
  const pendingCaptureRef = useRef<{
    jobId: string;
    nextStatus: JobStatus;
    photo?: string;
    lat?: number;
    lng?: number;
  } | null>(null);

  const sendStatusUpdate = useCallback(
    async (
      job: Job,
      status: JobStatus,
      extra: { photo?: string; lat?: number; lng?: number; failureReason?: FailureReason }
    ): Promise<boolean> => {
      const result = await submitJobStatus(job.id, status, extra);
      if (!result.sent) {
        setQueuedIds(getQueuedJobIds());
        setNotice("You're offline — this update is saved and will sync automatically once you're back online.");
      } else if (result.job) {
        onUpdated(result.job);
      }
      return result.sent;
    },
    [onUpdated]
  );

  const advance = useCallback(
    async (job: Job) => {
      const action = getNextAction(job);
      if (!action) return;
      // Set before the (possibly slow) camera capture below, not after —
      // isUpdating disables this job's action button once this is set, so a
      // fast double-tap while the camera modal is still opening would
      // otherwise fire a second concurrent submission for the same job.
      setUpdatingId(job.id);
      setError(null);
      setNotice(null);

      try {
        let photo: string | undefined;
        let lat: number | undefined;
        let lng: number | undefined;

        const pending = pendingCaptureRef.current;
        const reusable = pending && pending.jobId === job.id && pending.nextStatus === action.next;

        if (reusable) {
          photo = pending.photo;
          lat = pending.lat;
          lng = pending.lng;
        } else if (isPhotoRequired(action.next, job)) {
          try {
            const captured = await capturePhoto(ImagePicker.CameraType.back);
            if (!captured) {
              const label = action.next === "PICKED_UP" ? "pickup" : "delivery";
              setError(`A ${label} photo is required to continue.`);
              return;
            }
            photo = captured;
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not open the camera");
            return;
          }
          // Attached as verification metadata alongside the photo — best
          // effort, a denied/unavailable GPS fix still lets the delivery proceed.
          const { coords } = await getCoords();
          if (coords) {
            lat = coords.lat;
            lng = coords.lng;
          }
          pendingCaptureRef.current = { jobId: job.id, nextStatus: action.next, photo, lat, lng };
        }

        await sendStatusUpdate(job, action.next, { photo, lat, lng });
        // Handed off either way (sent live, or handed to the offline queue) —
        // nothing left to retry with this same captured photo.
        pendingCaptureRef.current = null;
      } catch (e) {
        // Deliberately NOT clearing pendingCaptureRef here — see the comment
        // above it. Tapping the action again will resubmit with this same
        // photo instead of reopening the camera.
        setError(e instanceof ApiError ? e.message : "Could not update job");
      } finally {
        setUpdatingId(null);
      }
    },
    [sendStatusUpdate]
  );

  const requestMarkFailed = useCallback((job: Job) => setFailingJob(job), []);
  const cancelMarkFailed = useCallback(() => setFailingJob(null), []);

  const submitFailure = useCallback(
    async (reason: FailureReason) => {
      const job = failingJob;
      if (!job) return;
      setFailingJob(null);
      setError(null);
      setNotice(null);
      setUpdatingId(job.id);
      try {
        await sendStatusUpdate(job, "FAILED", { failureReason: reason });
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not mark this job failed");
      } finally {
        setUpdatingId(null);
      }
    },
    [failingJob, sendStatusUpdate]
  );

  const refreshQueuedIds = useCallback(() => setQueuedIds(getQueuedJobIds()), []);

  return {
    advance,
    updatingId,
    error,
    notice,
    queuedIds,
    refreshQueuedIds,
    failingJob,
    requestMarkFailed,
    cancelMarkFailed,
    submitFailure,
  };
}
