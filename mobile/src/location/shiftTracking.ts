import { Alert } from "react-native";
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

// A dedicated in-app explanation shown before the OS background-location
// prompt — required by Google Play's background location policy as a
// "prominent disclosure" distinct from the system permission dialog's own
// rationale text. Declining skips straight to the foreground-only fallback
// below rather than asking the OS at all, so a driver who says no here isn't
// immediately re-prompted by the system dialog anyway.
function confirmBackgroundLocationDisclosure(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Location While Clocked In",
      "Giant Man Express records your location — including while the app is in the background — for as long as you're clocked in, to track mileage and show dispatch your live route to the next stop. Tracking stops the moment you clock out.",
      [
        { text: "Not Now", style: "cancel", onPress: () => resolve(false) },
        { text: "Continue", onPress: () => resolve(true) },
      ]
    );
  });
}

// Starts location tracking for the current shift. Requests background
// permission so tracking can continue while the app is minimized (shown to
// the driver via a persistent notification, per Android's foreground-service
// location requirements); if that's denied, falls back to foreground-only
// tracking that pauses whenever the app is backgrounded and has no way to
// resume itself — the caller resuming tracking on next load() covers that.
export async function startShiftTracking(): Promise<TrackingMode> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return "denied";

  // Only show the disclosure (and ask the OS) when background permission
  // isn't already granted — this function re-runs on every clock-in and on
  // every app-foreground resume (see AuthContext's AppState handling), so
  // without this check a driver who already said yes once would get
  // re-prompted every single time instead of just the first.
  const existingBg = await Location.getBackgroundPermissionsAsync().catch(() => null);
  let bg = existingBg?.status === "granted" ? existingBg : null;
  if (!bg) {
    const disclosureAccepted = await confirmBackgroundLocationDisclosure();
    bg = disclosureAccepted ? await Location.requestBackgroundPermissionsAsync().catch(() => null) : null;
  }

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
