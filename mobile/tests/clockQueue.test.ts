import { describe, it, expect, vi, beforeEach } from "vitest";

const { fakeFiles, FakeFile, FakeApiError } = vi.hoisted(() => {
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

const post = vi.fn();
vi.mock("../src/api/client", () => ({
  api: { post: (...args: unknown[]) => post(...args) },
  ApiError: FakeApiError,
}));

import { submitClockAction, flushQueuedClockActions, hasQueuedClockAction, MAX_CLOCK_QUEUE_ITEMS } from "../src/lib/clockQueue";

beforeEach(() => {
  fakeFiles.clear();
  post.mockReset();
});

describe("submitClockAction", () => {
  it("sends live and returns true on success", async () => {
    post.mockResolvedValue(undefined);
    const sent = await submitClockAction("clock-in", { lat: 1, lng: 2, selfie: "data:image/jpeg;base64,x" });
    expect(sent).toBe(true);
    expect(post).toHaveBeenCalledWith("/api/driver/clock-in", { lat: 1, lng: 2, selfie: "data:image/jpeg;base64,x" });
    expect(hasQueuedClockAction()).toBe(false);
  });

  it("queues and returns false on a network failure (status 0)", async () => {
    post.mockRejectedValue(new FakeApiError("offline", 0));
    const sent = await submitClockAction("clock-out", { lat: 1, lng: 2 });
    expect(sent).toBe(false);
    expect(hasQueuedClockAction()).toBe(true);
  });

  it("rethrows a definite server rejection instead of queueing it", async () => {
    post.mockRejectedValue(new FakeApiError("Already clocked in", 409));
    await expect(submitClockAction("clock-in", {})).rejects.toThrow("Already clocked in");
    expect(hasQueuedClockAction()).toBe(false);
  });

  it("caps the queue, dropping the oldest entry", async () => {
    post.mockRejectedValue(new FakeApiError("offline", 0));
    for (let i = 0; i < MAX_CLOCK_QUEUE_ITEMS + 3; i++) {
      await submitClockAction("clock-in", { lat: i, lng: i });
    }
    expect(hasQueuedClockAction()).toBe(true);
  });
});

describe("flushQueuedClockActions", () => {
  it("sends a queued action and clears it on success", async () => {
    post.mockRejectedValueOnce(new FakeApiError("offline", 0));
    await submitClockAction("clock-in", { lat: 1, lng: 2, selfie: "photo" });
    expect(hasQueuedClockAction()).toBe(true);

    post.mockReset();
    post.mockResolvedValue(undefined);
    await flushQueuedClockActions();

    expect(post).toHaveBeenCalledWith("/api/driver/clock-in", { lat: 1, lng: 2, selfie: "photo" });
    expect(hasQueuedClockAction()).toBe(false);
  });

  it("stops at the first still-offline failure and leaves it queued", async () => {
    post.mockRejectedValue(new FakeApiError("offline", 0));
    await submitClockAction("clock-out", { lat: 1, lng: 2 });

    post.mockClear();
    await flushQueuedClockActions();

    expect(post).toHaveBeenCalledTimes(1);
    expect(hasQueuedClockAction()).toBe(true);
  });

  it("drops a definitely-rejected queued action instead of retrying it forever", async () => {
    post.mockRejectedValueOnce(new FakeApiError("offline", 0));
    await submitClockAction("clock-out", { lat: 1, lng: 2 });

    post.mockReset();
    post.mockRejectedValue(new FakeApiError("Already clocked out", 409));
    await flushQueuedClockActions();

    expect(hasQueuedClockAction()).toBe(false);
  });

  it("does nothing when the queue is empty", async () => {
    await flushQueuedClockActions();
    expect(post).not.toHaveBeenCalled();
  });
});
