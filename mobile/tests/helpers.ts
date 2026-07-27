import { Job, JobStatus } from "../src/api/types";

// A minimal, fully-defaulted Job fixture — tests override only the fields
// they actually care about. Cast through unknown for the fields these pure
// functions never read (jobType, driver, etc.) rather than fabricating a
// full nested fixture for every test.
export function makeJob(overrides: Partial<Job> & { status: JobStatus }): Job {
  return {
    id: "job-1",
    title: "Test Job",
    pickupAddress: null,
    customerPhone: null,
    dropoffStops: [],
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    acceptedAt: null,
    arrivedAt: null,
    pickedUpAt: null,
    onTheWayAt: null,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    pickupPhoto: null,
    deliveryPhoto: null,
    pickupLat: null,
    pickupLng: null,
    deliveryLat: null,
    deliveryLng: null,
    jobType: { id: "type-1", name: "Delivery", active: true },
    ...overrides,
  };
}
