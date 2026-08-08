import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import * as Location from "expo-location";
import { spacing, ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import { LatLng, geocodeAddress } from "../lib/osm";
import { LiveRouteMap, MapFallback } from "./LiveRouteMap";

// Distance-based refresh — matches the shift location tracking cadence
// elsewhere in the app (see location/shiftTracking.ts) rather than
// polling more aggressively than the driver is actually moving.
const WATCH_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 15_000,
  distanceInterval: 25,
};

interface Props {
  destinationAddress: string;
  destinationLabel: string;
}

// Live route from the driver's current GPS position to a delivery address —
// driver marker, destination marker, and the actual driving route between
// them (OpenStreetMap tiles + OSRM routing, both free/keyless — see
// LiveRouteMap), auto-framed to fit both. Renders a plain-text fallback
// (not a blank/broken map) if the address can't be geocoded.
export function DriverRouteMap({ destinationAddress, destinationLabel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Distinct from "still geocoding" — without this, a failure (offline,
  // quota, bad address) left destination permanently null with no way to
  // tell "still trying" from "gave up", so the component was stuck showing
  // "Locating…" forever with no error and no retry.
  const [geocodeFailed, setGeocodeFailed] = useState(false);
  const [geocodeAttempt, setGeocodeAttempt] = useState(0);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        if (!cancelled) setError("Location permission is needed to show the live route.");
        return;
      }
      subscription = await Location.watchPositionAsync(WATCH_OPTIONS, (loc) => {
        setOrigin({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      });
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDestination(null);
    setGeocodeFailed(false);
    geocodeAddress(destinationAddress).then((coords) => {
      if (cancelled) return;
      if (coords) setDestination(coords);
      else setGeocodeFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [destinationAddress, geocodeAttempt]);

  const retryGeocode = useCallback(() => setGeocodeAttempt((n) => n + 1), []);

  if (error) {
    return (
      <MapFallback>
        <Text style={styles.fallbackText}>{error}</Text>
      </MapFallback>
    );
  }

  if (geocodeFailed) {
    return (
      <MapFallback>
        <Text style={styles.fallbackText}>Couldn't map this address — check your connection.</Text>
        <Text style={styles.fallbackAddress}>
          {destinationLabel}: {destinationAddress}
        </Text>
        <Pressable onPress={retryGeocode} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retry">
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </MapFallback>
    );
  }

  if (!origin || !destination) {
    return (
      <MapFallback centered>
        <Text style={styles.fallbackText}>Locating you and {destinationLabel.toLowerCase()}…</Text>
      </MapFallback>
    );
  }

  return <LiveRouteMap origin={origin} destination={destination} destinationLabel={destinationLabel} />;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fallbackText: {
      color: colors.textMuted,
      fontSize: 13,
    },
    fallbackAddress: {
      color: colors.text,
      fontSize: 13,
      marginTop: spacing.xs,
      fontWeight: "600",
    },
    retryText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: "700",
      marginTop: spacing.sm,
    },
  });
}
