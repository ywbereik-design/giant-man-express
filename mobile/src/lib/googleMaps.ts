// Same Google Cloud Maps Platform key used by the native Maps SDK
// (see app.config.js) — also used here for client-side Geocoding and
// Directions calls, which is the standard/documented pattern for
// react-native-maps-directions (it calls the Directions API directly from
// the device). Enable Maps SDK for Android/iOS, Directions API, and
// Geocoding API on this key in Google Cloud Console.
export const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export interface LatLng {
  latitude: number;
  longitude: number;
}

// Converts a free-text address (as entered by dispatch — pickupAddress /
// a JobStop's address, never validated or geocoded at entry time) into
// coordinates. Returns null rather than throwing on any failure (no key,
// network error, address not found) so callers can fall back to showing
// the address as plain text instead of a map.
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  if (!GOOGLE_MAPS_API_KEY || !address.trim()) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address
    )}&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    const location = data?.results?.[0]?.geometry?.location;
    if (!location) return null;
    return { latitude: location.lat, longitude: location.lng };
  } catch {
    return null;
  }
}
