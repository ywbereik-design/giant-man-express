import { Alert, Linking } from "react-native";

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

// Hands a destination address straight to the device's own Maps app in
// turn-by-turn driving mode — deliberately not a coordinate pair: passing
// the plain address lets Google/Apple Maps do their own (better, always
// up to date) geocoding, so this needs no network call of its own and
// can't fail the way our free Nominatim/OSRM lookup could. The same
// https://www.google.com/maps/dir/... link works as a universal handoff
// on both platforms — Android and iOS both open the Google Maps app
// directly if it's installed (verified app/universal links), falling back
// to opening it in the browser otherwise, so no per-platform URL scheme or
// Info.plist entry is needed.
export async function openNavigationTo(address: string): Promise<void> {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Can't open Maps", "This device can't open map links.");
  }
}
