import * as Location from "expo-location";
import { SHIFT_LOCATION_TASK, postLocationPing } from "./shiftLocationTask";

// Ping about once a minute, or after 50m of movement — whichever comes
// first. Frequent enough for a useful live view without burning battery or
// data on a driver who's stationary for most of a shift.
const TIME_INTERVAL_MS = 60_000;
const DISTANCE_INTERVAL_M = 50;

export type TrackingMode = "background" | "foreground-only" | "denied";

// Only used for the foreground-only fallback path — startLocationUpdatesAsync
// tracks its own running state internally (see hasStartedLocationUpdatesAsync),
// but watchPositionAsync's subscription has to be held onto ourselves to stop it later.
let foregroundSubscription: Location.LocationSubscription | null = null;

// Starts location tracking for the current shift. Requests background
// permission so tracking can continue while the app is minimized (shown to
// the driver via a persistent notification, per Android's foreground-service
// location requirements); if that's denied, falls back to foreground-only
// tracking that pauses whenever the app is backgrounded and has no way to
// resume itself — the caller resuming tracking on next load() covers that.
export async function startShiftTracking(): Promise<TrackingMode> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return "denied";

  const bg = await Location.requestBackgroundPermissionsAsync().catch(() => null);

  if (bg?.status === "granted") {
    foregroundSubscription?.remove();
    foregroundSubscription = null;

    const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(SHIFT_LOCATION_TASK).catch(
      () => false
    );
    if (!alreadyRunning) {
      await Location.startLocationUpdatesAsync(SHIFT_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: TIME_INTERVAL_MS,
        distanceInterval: DISTANCE_INTERVAL_M,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "Giant Man Express",
          notificationBody: "Tracking your location while you're clocked in",
        },
      });
    }
    return "background";
  }

  if (!foregroundSubscription) {
    foregroundSubscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: TIME_INTERVAL_MS, distanceInterval: DISTANCE_INTERVAL_M },
      (loc) => {
        postLocationPing(loc.coords.latitude, loc.coords.longitude);
      }
    );
  }
  return "foreground-only";
}

export async function stopShiftTracking(): Promise<void> {
  foregroundSubscription?.remove();
  foregroundSubscription = null;

  const running = await Location.hasStartedLocationUpdatesAsync(SHIFT_LOCATION_TASK).catch(() => false);
  if (running) {
    await Location.stopLocationUpdatesAsync(SHIFT_LOCATION_TASK);
  }
}

export async function isShiftTrackingActive(): Promise<boolean> {
  if (foregroundSubscription) return true;
  return Location.hasStartedLocationUpdatesAsync(SHIFT_LOCATION_TASK).catch(() => false);
}
