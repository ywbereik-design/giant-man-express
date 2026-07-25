import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";
import { SESSION_STORAGE_KEY } from "../auth/storage";
import { apiBaseUrl } from "../api/client";

export const SHIFT_LOCATION_TASK = "shift-location-tracking";

interface StoredSession {
  token: string;
}

// Used both by the background TaskManager task below (which runs outside
// the React tree, so it can't use the in-memory api client) and by the
// foreground fallback in shiftTracking.ts, so both paths post pings the
// same way regardless of which one is active for a given driver.
export async function postLocationPing(lat: number, lng: number): Promise<void> {
  let raw: string | null;
  try {
    raw = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  let session: StoredSession;
  try {
    session = JSON.parse(raw);
  } catch {
    return;
  }
  if (!session.token) return;

  try {
    await fetch(`${apiBaseUrl()}/api/driver/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ lat, lng }),
    });
  } catch {
    // Offline or server unreachable — this ping is dropped rather than
    // queued. The next successful ping resumes distance accumulation from
    // wherever the driver is by then, which is fine for a live-tracking
    // feature where recency matters more than a complete trail.
  }
}

// Must be defined at module scope (not inside a component) so it's
// registered as soon as this module is imported — including on a headless
// relaunch after the app process was killed while a background task was
// still active. See mobile/index.ts, which imports this before anything else.
TaskManager.defineTask(SHIFT_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    // Otherwise a driver's mileage tracking can silently stop (location
    // services disabled, permission revoked while backgrounded, OS killed
    // the task) with zero signal to anyone that it happened — this at least
    // makes it visible in device logs / any crash-reporting integration
    // that later hooks into console output.
    console.warn("[shift-location-task] location update error:", error.message);
    return;
  }
  const locations = (data as { locations?: { coords: { latitude: number; longitude: number } }[] } | undefined)
    ?.locations;
  const latest = locations?.[locations.length - 1];
  if (!latest) return;
  await postLocationPing(latest.coords.latitude, latest.coords.longitude);
});
