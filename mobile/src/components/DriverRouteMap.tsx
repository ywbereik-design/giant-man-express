import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../theme/theme";
import { GOOGLE_MAPS_API_KEY, LatLng, geocodeAddress } from "../lib/googleMaps";

const EDGE_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };
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
// them via the Google Directions API, auto-framed to fit both. Renders a
// plain-text fallback (not a blank/broken map) if no Google Maps API key is
// configured, or if the address can't be geocoded.
export function DriverRouteMap({ destinationAddress, destinationLabel }: Props) {
  const mapRef = useRef<MapView>(null);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    geocodeAddress(destinationAddress).then((coords) => {
      if (!cancelled && coords) setDestination(coords);
    });
    return () => {
      cancelled = true;
    };
  }, [destinationAddress]);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Map unavailable (no Google Maps API key configured).</Text>
        <Text style={styles.fallbackAddress}>
          {destinationLabel}: {destinationAddress}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>{error}</Text>
      </View>
    );
  }

  if (!origin || !destination) {
    return (
      <View style={[styles.fallback, styles.loading]}>
        <Text style={styles.fallbackText}>Locating you and {destinationLabel.toLowerCase()}…</Text>
      </View>
    );
  }

  return (
    <View style={styles.mapWrapper}>
      <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={toRegion(origin)}>
        <Marker coordinate={origin} title="You" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.driverMarker}>
            <Ionicons name="navigate" size={14} color={colors.primaryText} />
          </View>
        </Marker>
        <Marker coordinate={destination} title={destinationLabel} pinColor={colors.primary} />
        <MapViewDirections
          origin={origin}
          destination={destination}
          apikey={GOOGLE_MAPS_API_KEY}
          strokeWidth={4}
          strokeColor={colors.primary}
          onReady={(result) => {
            mapRef.current?.fitToCoordinates(result.coordinates, {
              edgePadding: EDGE_PADDING,
              animated: true,
            });
          }}
          onError={() => {
            // Directions failed (no route, quota, etc.) — still frame both
            // markers so the map isn't stuck zoomed on just the origin.
            mapRef.current?.fitToCoordinates([origin, destination], {
              edgePadding: EDGE_PADDING,
              animated: true,
            });
          }}
        />
      </MapView>
    </View>
  );
}

function toRegion(point: LatLng) {
  return { ...point, latitudeDelta: 0.05, longitudeDelta: 0.05 };
}

const styles = StyleSheet.create({
  mapWrapper: {
    height: 260,
    borderRadius: 12,
    overflow: "hidden",
    marginTop: spacing.sm,
  },
  map: {
    flex: 1,
  },
  driverMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.primaryText,
  },
  fallback: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loading: {
    alignItems: "center",
  },
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
});
