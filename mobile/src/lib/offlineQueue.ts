import { File, Paths } from "expo-file-system";
import { api, ApiError } from "../api/client";
import { JobStatus } from "../api/types";

// A pickup/delivery status update the driver made while offline (or on a
// flaky connection) — held here until it can actually reach the server,
// rather than being lost or forcing the driver to redo the photo later.
export interface QueuedJobUpdate {
  localId: string;
  jobId: string;
  status: JobStatus;
  photo?: string;
  lat?: number;
  lng?: number;
  failureReason?: string;
  queuedAt: string;
}

const queueFile = new File(Paths.document, "pending-job-updates.json");

function readQueue(): QueuedJobUpdate[] {
  if (!queueFile.exists) return [];
  try {
    return JSON.parse(queueFile.textSync());
  } catch {
    // Corrupt/partial write — treat as empty rather than blocking forever on
    // a file we can't parse.
    return [];
  }
}

function writeQueue(items: QueuedJobUpdate[]): void {
  queueFile.write(JSON.stringify(items));
}

export function enqueueJobUpdate(update: Omit<QueuedJobUpdate, "localId" | "queuedAt">): void {
  const items = readQueue();
  items.push({ ...update, localId: `${update.jobId}-${Date.now()}`, queuedAt: new Date().toISOString() });
  writeQueue(items);
}

// So the job list can show "queued, will sync" on a card the driver already
// acted on while offline, instead of it looking untouched.
export function getQueuedJobIds(): Set<string> {
  return new Set(readQueue().map((u) => u.jobId));
}

let flushing = false;

// Sends every queued update in order, oldest first. Stops at the first
// network failure (still offline) and leaves the rest queued for next time;
// a definite server rejection (e.g. the job's state moved on since this was
// queued) drops just that one item rather than blocking everything behind it
// forever.
export async function flushQueuedJobUpdates(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let items = readQueue();
    while (items.length > 0) {
      const [next, ...rest] = items;
      try {
        await api.patch(`/api/driver/jobs/${next.jobId}/status`, {
          status: next.status,
          photo: next.photo,
          lat: next.lat,
          lng: next.lng,
          failureReason: next.failureReason,
        });
        items = rest;
        writeQueue(items);
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) {
          // Still offline — leave this and everything behind it queued.
          break;
        }
        // A real rejection (400/404/etc.) — this update can never succeed as
        // queued (e.g. the job already moved past this transition), so drop
        // it and keep going rather than blocking the rest of the queue.
        items = rest;
        writeQueue(items);
      }
    }
  } finally {
    flushing = false;
  }
}
