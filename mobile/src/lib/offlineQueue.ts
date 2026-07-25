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

// Caps growth for a driver offline for an extended stretch — each item can
// carry a full proof photo (~200-500KB, see capturePhoto.ts), so this isn't
// unbounded. Dropping the oldest pending update on overflow rather than
// refusing the newest one, since the newest is the action the driver just
// took and is the one most likely to still be actionable.
const MAX_QUEUE_ITEMS = 20;

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

// Writes via a fresh temp file + move rather than overwriting queueFile
// in place, so a process kill mid-write can't leave behind a truncated,
// unparseable JSON file — the only failure window that remains is between
// deleting the old file and moving the new one into place (two fast
// synchronous calls), not the entire serialize-and-write.
function writeQueue(items: QueuedJobUpdate[]): void {
  const tmp = new File(Paths.document, `pending-job-updates.${Date.now()}.tmp.json`);
  tmp.write(JSON.stringify(items));
  if (queueFile.exists) queueFile.delete();
  tmp.move(queueFile);
}

export function enqueueJobUpdate(update: Omit<QueuedJobUpdate, "localId" | "queuedAt">): void {
  const items = readQueue();
  items.push({ ...update, localId: `${update.jobId}-${Date.now()}`, queuedAt: new Date().toISOString() });
  while (items.length > MAX_QUEUE_ITEMS) items.shift();
  writeQueue(items);
}

function removeQueuedItem(localId: string): void {
  writeQueue(readQueue().filter((i) => i.localId !== localId));
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
//
// Re-reads the queue from disk at the top of every iteration (and again,
// via removeQueuedItem, right before each write) instead of working off one
// in-memory snapshot for the whole run — enqueueJobUpdate is fully
// synchronous with no `await`, so it can only ever run to completion
// between two of this function's own awaits, never during one. Reading
// fresh each time means whatever it just added is still there afterward,
// instead of being silently overwritten by this function writing back a
// now-stale list.
export async function flushQueuedJobUpdates(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    while (true) {
      const next = readQueue()[0];
      if (!next) break;
      try {
        await api.patch(`/api/driver/jobs/${next.jobId}/status`, {
          status: next.status,
          photo: next.photo,
          lat: next.lat,
          lng: next.lng,
          failureReason: next.failureReason,
        });
        removeQueuedItem(next.localId);
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) break; // still offline — stop, leave it queued
        removeQueuedItem(next.localId); // can never succeed as queued — drop it, keep going
      }
    }
  } finally {
    flushing = false;
  }
}
