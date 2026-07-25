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
