import { describe, it, expect } from "vitest";
import { routeDestination } from "../src/lib/routeDestination";
import { makeJob } from "./helpers";

describe("routeDestination", () => {
  it("points to the pickup address once the driver has accepted but not arrived", () => {
    const job = makeJob({ status: "ACCEPTED", pickupAddress: "123 Depot Rd" });
    expect(routeDestination(job)).toEqual({ address: "123 Depot Rd", label: "Pickup" });
  });

  it("returns null for an accepted job with no pickup address on file", () => {
    const job = makeJob({ status: "ACCEPTED", pickupAddress: null });
    expect(routeDestination(job)).toBeNull();
  });

  it("points to the next dropoff stop once arrived at pickup", () => {
    const job = makeJob({
      status: "ARRIVED",
      dropoffStops: [{ id: "s1", address: "456 Client Ave", sequence: 0 }],
    });
    expect(routeDestination(job)).toEqual({ address: "456 Client Ave", label: "Dropoff" });
  });

  it("labels the destination 'Next Stop' when there's more than one dropoff", () => {
    const job = makeJob({
      status: "ON_THE_WAY",
      dropoffStops: [
        { id: "s1", address: "456 Client Ave", sequence: 0 },
        { id: "s2", address: "789 Other St", sequence: 1 },
      ],
    });
    expect(routeDestination(job)).toEqual({ address: "456 Client Ave", label: "Next Stop" });
  });

  it("returns null once picked up with no remaining dropoff stops", () => {
    const job = makeJob({ status: "PICKED_UP", dropoffStops: [] });
    expect(routeDestination(job)).toBeNull();
  });

  it("returns null for a job not yet accepted", () => {
    const job = makeJob({ status: "ASSIGNED", pickupAddress: "123 Depot Rd" });
    expect(routeDestination(job)).toBeNull();
  });

  it("returns null for a terminal job (delivered, cancelled, or failed)", () => {
    expect(routeDestination(makeJob({ status: "DELIVERED", dropoffStops: [{ id: "s1", address: "X", sequence: 0 }] }))).toBeNull();
    expect(routeDestination(makeJob({ status: "CANCELLED", dropoffStops: [{ id: "s1", address: "X", sequence: 0 }] }))).toBeNull();
    expect(routeDestination(makeJob({ status: "FAILED", dropoffStops: [{ id: "s1", address: "X", sequence: 0 }] }))).toBeNull();
  });
});
