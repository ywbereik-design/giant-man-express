import { Alert, Linking, Platform } from "react-native";

// The pickup/dropoff address field can hold either plain text or a share
// link a driver/admin pasted in — Google Maps' maps.app.goo.gl, goo.gl/maps,
// and google.com/maps links are all https, so one http(s) check covers all
// of them without needing to special-case any specific domain.
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

// Opens Google Maps (app if installed, browser otherwise — the
// maps.google.com web fallback handles that automatically) for a pickup/
// dropoff address. A pasted Google Maps share link is opened as-is —
// wrapping it in a search query would just search for the URL as literal
// text — otherwise it's treated as a plain address and centered on a
// search for it.
export async function openAddressInMaps(addressOrUrl: string): Promise<void> {
  const trimmed = addressOrUrl.trim();
  const url = isHttpUrl(trimmed)
    ? trimmed
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Can't open Maps", "This device can't open map links.");
  }
}

// Hands a pickup/dropoff address straight to Google Maps in turn-by-turn
// driving mode. Smart about what it's given:
//  - A pasted Google Maps share link (maps.app.goo.gl, goo.gl/maps,
//    google.com/maps, or any other http(s) URL) is opened directly via
//    Linking.openURL — Google Maps resolves the pin/route it encodes far
//    better than we could by re-parsing the link ourselves, and stuffing a
//    URL into the google.navigation:/dir query params below wouldn't work.
//  - A plain text address (or a "lat,lng" pair typed in directly) goes
//    through the navigation-intent path: on Android, `google.navigation:q=...`
//    is a scheme proprietary to the Google Maps app — opening it launches
//    Google Maps directly in active navigation mode, no app-picker dialog.
//    iOS has no equivalent "start navigating now" intent for Google Maps,
//    so it (and any failure of the Android scheme, e.g. Google Maps not
//    installed) falls back to the https://www.google.com/maps/dir/...
//    universal link, which opens the Google Maps app if installed or the
//    web otherwise.
export async function openNavigationTo(addressOrUrl: string): Promise<void> {
  const trimmed = addressOrUrl.trim();

  if (isHttpUrl(trimmed)) {
    try {
      await Linking.openURL(trimmed);
    } catch {
      Alert.alert("Can't open Maps", "This device can't open map links.");
    }
    return;
  }

  const encoded = encodeURIComponent(trimmed);
  const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;

  if (Platform.OS === "android") {
    try {
      await Linking.openURL(`google.navigation:q=${encoded}`);
      return;
    } catch {
      // fall through to the web link below
    }
  }

  try {
    await Linking.openURL(webUrl);
  } catch {
    Alert.alert("Can't open Maps", "This device can't open map links.");
  }
}
