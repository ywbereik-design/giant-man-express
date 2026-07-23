import { Job } from "../api/types";

// Where the live route map should point for a job currently in progress:
// the pickup before the driver has arrived there, otherwise the next
// not-yet-reached delivery stop. Null for jobs that aren't actively being
// worked (not yet accepted, or already finished) or have no address to route to.
export function routeDestination(job: Job): { address: string; label: string } | null {
  if (job.status === "ACCEPTED") {
    return job.pickupAddress ? { address: job.pickupAddress, label: "Pickup" } : null;
  }
  if (job.status === "ARRIVED" || job.status === "PICKED_UP" || job.status === "ON_THE_WAY") {
    const nextStop = job.dropoffStops[0];
    if (!nextStop) return null;
    return { address: nextStop.address, label: job.dropoffStops.length > 1 ? "Next Stop" : "Dropoff" };
  }
  return null;
}
