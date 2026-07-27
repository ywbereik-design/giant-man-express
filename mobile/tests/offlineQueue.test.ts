import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above the rest of the file, so they can't
// close over a class/const declared further down (that throws "cannot
// access before initialization") — vi.hoisted() is the documented escape
// hatch: it runs before the hoisted vi.mock calls too, so its return value
// is safe to reference from inside them.
const { fakeFiles, FakeFile, FakeApiError } = vi.hoisted(() => {
  // In-memory fake filesystem — enough to exercise the real read/write/
  // delete/move logic in offlineQueue.ts without touching a real filesystem.
  const fakeFiles = new Map<string, string>();

  class FakeFile {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : (p as { uri: string }).uri)).join("/");
    }
    get exists() {
      return fakeFiles.has(this.uri);
    }
    textSync() {
      const v = fakeFiles.get(this.uri);
      if (v === undefined) throw new Error(`FakeFile ${this.uri} does not exist`);
      return v;
    }
    write(content: string) {
      fakeFiles.set(this.uri, content);
    }
    delete() {
      fakeFiles.delete(this.uri);
    }
    move(destination: FakeFile) {
      const content = fakeFiles.get(this.uri) ?? "";
      fakeFiles.delete(this.uri);
      fakeFiles.set(destination.uri, content);
      this.uri = destination.uri;
    }
  }

  class FakeApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }

  return { fakeFiles, FakeFile, FakeApiError };
});

vi.mock("expo-file-system", () => ({
  File: FakeFile,
  Paths: { document: "document-root" },
}));

const patch = vi.fn();
vi.mock("../src/api/client", () => ({
  api: { patch: (...args: unknown[]) => patch(...args) },
  ApiError: FakeApiError,
}));

import { enqueueJobUpdate, getQueuedJobIds, flushQueuedJobUpdates, MAX_QUEUE_ITEMS } from "../src/lib/offlineQueue";

beforeEach(() => {
  fakeFiles.clear();
  patch.mockReset();
});

describe("enqueueJobUpdate / getQueuedJobIds", () => {
  it("queues an update and reports its jobId as pending", () => {
    enqueueJobUpdate({ jobId: "job-1", status: "ACCEPTED" });
    expect(getQueuedJobIds().has("job-1")).toBe(true);
  });

  it("keeps multiple distinct pending jobs", () => {
    enqueueJobUpdate({ jobId: "job-1", status: "ACCEPTED" });
    enqueueJobUpdate({ jobId: "job-2", status: "ARRIVED" });
    expect(getQueuedJobIds()).toEqual(new Set(["job-1", "job-2"]));
  });

  it("drops the oldest entry once the queue exceeds its cap", () => {
    for (let i = 0; i < MAX_QUEUE_ITEMS + 5; i++) {
      enqueueJobUpdate({ jobId: `job-${i}`, status: "ACCEPTED" });
    }
    const remaining = getQueuedJobIds();
    expect(remaining.size).toBe(MAX_QUEUE_ITEMS);
    // The oldest 5 were dropped; the most recent ones (the driver's latest
    // actions) survive.
    expect(remaining.has("job-0")).toBe(false);
    expect(remaining.has(`job-${MAX_QUEUE_ITEMS + 4}`)).toBe(true);
  });
});

describe("flushQueuedJobUpdates", () => {
  it("sends a queued update and removes it on success", async () => {
    enqueueJobUpdate({ jobId: "job-1", status: "ACCEPTED" });
    patch.mockResolvedValue(undefined);

    await flushQueuedJobUpdates();

    expect(patch).toHaveBeenCalledWith("/api/driver/jobs/job-1/status", expect.objectContaining({ status: "ACCEPTED" }));
    expect(getQueuedJobIds().size).toBe(0);
  });

  it("stops and leaves everything queued on a network failure (status 0)", async () => {
    enqueueJobUpdate({ jobId: "job-1", status: "ACCEPTED" });
    enqueueJobUpdate({ jobId: "job-2", status: "ARRIVED" });
    patch.mockRejectedValue(new FakeApiError("offline", 0));

    await flushQueuedJobUpdates();

    expect(patch).toHaveBeenCalledTimes(1); // stopped at the first failure, never tried job-2
    expect(getQueuedJobIds()).toEqual(new Set(["job-1", "job-2"]));
  });

  it("drops just one item on a definite rejection and keeps going", async () => {
    enqueueJobUpdate({ jobId: "job-1", status: "ACCEPTED" });
    enqueueJobUpdate({ jobId: "job-2", status: "ARRIVED" });
    patch.mockRejectedValueOnce(new FakeApiError("job already moved on", 400)).mockResolvedValueOnce(undefined);

    await flushQueuedJobUpdates();

    expect(patch).toHaveBeenCalledTimes(2);
    expect(getQueuedJobIds().size).toBe(0);
  });

  // Regression test for the data-loss race a security-adjacent review found:
  // flushQueuedJobUpdates used to work off one in-memory snapshot of the
  // queue for its whole run, so anything enqueued while a request was still
  // in flight got silently overwritten when the flush wrote its (by then
  // stale) snapshot back. The fix re-reads the queue fresh at every step.
  it("does not drop an item enqueued while a different item's request is still in flight", async () => {
    enqueueJobUpdate({ jobId: "job-A", status: "ACCEPTED" });
    patch.mockImplementationOnce(async () => {
      enqueueJobUpdate({ jobId: "job-B", status: "ACCEPTED" });
    });
    patch.mockResolvedValue(undefined);

    await flushQueuedJobUpdates();

    // If job-B had been lost, the loop would have seen an empty queue after
    // removing job-A and exited — patch would never be called a second time.
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch.mock.calls[1][0]).toContain("job-B");
    expect(getQueuedJobIds().size).toBe(0);
  });

  it("does nothing when the queue is empty", async () => {
    await flushQueuedJobUpdates();
    expect(patch).not.toHaveBeenCalled();
  });
});
