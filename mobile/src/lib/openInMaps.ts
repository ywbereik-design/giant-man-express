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

// Hands a destination address straight to Google Maps in turn-by-turn
// driving mode — deliberately not a coordinate pair: passing the plain
// address lets Google Maps do its own (better, always up to date)
// geocoding, so this needs no network call of its own and can't fail the
// way our free Nominatim/OSRM lookup could.
//
// On Android, `google.navigation:q=...` is a scheme proprietary to the
// Google Maps app — opening it launches Google Maps directly in active
// navigation mode, no app-picker dialog. iOS has no equivalent "start
// navigating now" intent for Google Maps, so it (and any failure of the
// Android scheme, e.g. Google Maps not installed) falls back to the
// https://www.google.com/maps/dir/... universal link, which opens the
// Google Maps app if installed or the web otherwise.
export async function openNavigationTo(address: string): Promise<void> {
  const encoded = encodeURIComponent(address);
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
