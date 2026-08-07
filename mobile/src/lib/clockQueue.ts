import { File, Paths } from "expo-file-system";
import { api, ApiError } from "../api/client";

// A clock-in/clock-out the driver made while offline (or on a flaky
// connection) — held here until it can actually reach the server. Mirrors
// offlineQueue.ts's job-status queue (same temp-file-then-move write
// safety, same bounded size) as its own separate queue/file rather than
// folding into that one, since the two update completely different
// endpoints with a different payload shape.
export interface QueuedClockAction {
  localId: string;
  type: "clock-in" | "clock-out";
  lat?: number;
  lng?: number;
  selfie?: string; // clock-in only
  queuedAt: string;
}

// Lower than MAX_QUEUE_ITEMS in offlineQueue.ts — a driver only ever has at
// most one open clock-in/clock-out pair pending at a time in practice (you
// can't clock in twice in a row), so this just guards against a pathological
// runaway rather than needing real headroom.
export const MAX_CLOCK_QUEUE_ITEMS = 5;

const queueFile = new File(Paths.document, "pending-clock-actions.json");

function readQueue(): QueuedClockAction[] {
  if (!queueFile.exists) return [];
  try {
    return JSON.parse(queueFile.textSync());
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedClockAction[]): void {
  const tmp = new File(Paths.document, `pending-clock-actions.${Date.now()}.tmp.json`);
  tmp.write(JSON.stringify(items));
  if (queueFile.exists) queueFile.delete();
  tmp.move(queueFile);
}

function enqueueClockAction(action: Omit<QueuedClockAction, "localId" | "queuedAt">): void {
  const items = readQueue();
  items.push({ ...action, localId: `${action.type}-${Date.now()}`, queuedAt: new Date().toISOString() });
  while (items.length > MAX_CLOCK_QUEUE_ITEMS) items.shift();
  writeQueue(items);
}

function removeQueuedItem(localId: string): void {
  writeQueue(readQueue().filter((i) => i.localId !== localId));
}

export function hasQueuedClockAction(): boolean {
  return readQueue().length > 0;
}

// Sends a clock-in/out, and on a network failure (not a rejection) queues it
// for automatic retry instead of surfacing a hard error — same contract as
// submitJobStatus.ts: false means "queued", not "failed".
export async function submitClockAction(
  type: "clock-in" | "clock-out",
  extra: { lat?: number; lng?: number; selfie?: string } = {}
): Promise<boolean> {
  try {
    await api.post(`/api/driver/${type}`, extra);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) {
      enqueueClockAction({ type, ...extra });
      return false;
    }
    throw e;
  }
}

let flushing = false;

// Same shape as flushQueuedJobUpdates: stops at the first still-offline
// failure and leaves the rest queued; a definite rejection (e.g. already
// clocked in/out from another device by the time this synced) drops just
// that one item rather than blocking forever.
export async function flushQueuedClockActions(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    while (true) {
      const next = readQueue()[0];
      if (!next) break;
      try {
        await api.post(`/api/driver/${next.type}`, { lat: next.lat, lng: next.lng, selfie: next.selfie });
        removeQueuedItem(next.localId);
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) break;
        removeQueuedItem(next.localId);
      }
    }
  } finally {
    flushing = false;
  }
}
