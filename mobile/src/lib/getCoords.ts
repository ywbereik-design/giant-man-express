import * as Location from "expo-location";

const LOCATION_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export interface CoordsResult {
  coords?: { lat: number; lng: number };
  locationCaptured: boolean;
}

// Best-effort current position — used both for clock-in/out and for
// tagging pickup/delivery proof photos with the GPS position at capture
// time. Never throws: a denied permission or a slow/unavailable GPS fix
// just comes back as locationCaptured: false rather than blocking whatever
// the caller was doing.
export async function getCoords(): Promise<CoordsResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return { locationCaptured: false };
  try {
    const pos = await withTimeout(Location.getCurrentPositionAsync({}), LOCATION_TIMEOUT_MS);
    return { coords: { lat: pos.coords.latitude, lng: pos.coords.longitude }, locationCaptured: true };
  } catch {
    return { locationCaptured: false };
  }
}
