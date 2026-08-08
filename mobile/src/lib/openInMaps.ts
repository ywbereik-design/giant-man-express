import { Alert, Linking, Platform } from "react-native";

// Opens Google Maps (app if installed, browser otherwise — the
// maps.google.com web fallback handles that automatically) centered on a
// search for the given address. Used for both pickup and delivery
// addresses on job cards, so a driver can jump straight to navigation
// without retyping the address.
export async function openAddressInMaps(address: string): Promise<void> {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Can't open Maps", "This device can't open map links.");
  }
}

// Hands a destination address straight to the Google Maps app in
// turn-by-turn driving mode — deliberately not a coordinate pair: passing
// the plain address lets Google Maps do its own (better, always up to
// date) geocoding, so this needs no network call of its own and can't
// fail the way our free Nominatim/OSRM lookup could.
//
// Tries Google Maps' own URL scheme first — `google.navigation:` (Android)
// and `comgooglemaps://` (iOS) are proprietary to the Google Maps app, so
// opening them launches it directly and starts navigating immediately,
// with no app-picker dialog and no Apple Maps fallback on iOS. Only if
// that throws (Google Maps isn't installed) do we fall back to the
// https://www.google.com/maps/dir/... universal link, which opens Google
// Maps in the browser instead.
export async function openNavigationTo(address: string): Promise<void> {
  const encoded = encodeURIComponent(address);
  const nativeUrl =
    Platform.OS === "android"
      ? `google.navigation:q=${encoded}&mode=d`
      : `comgooglemaps://?daddr=${encoded}&directionsmode=driving`;
  const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;

  try {
    await Linking.openURL(nativeUrl);
  } catch {
    try {
      await Linking.openURL(webUrl);
    } catch {
      Alert.alert("Can't open Maps", "This device can't open map links.");
    }
  }
}
