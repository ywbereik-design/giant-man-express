import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError } from "../api/client";
import { Job, DriverLocationDetail } from "../api/types";
import { spacing, ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import { GOOGLE_MAPS_API_KEY, LatLng, geocodeAddress } from "../lib/googleMaps";
import { routeDestination } from "../lib/routeDestination";

const EDGE_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };
// Foreground-only polling while a dispatcher/admin has this driver expanded
// on screen — matches the app's existing client-pull architecture (no
// background service), just refreshed on a timer instead of on focus alone
// since "live tracking" implies the view should update while left open.
const POLL_INTERVAL_MS = 25_000;

interface Props {
  driverId: string;
}

// Third-party version of DriverRouteMap: instead of watching the device's
// own GPS, polls the backend for this OTHER driver's last-known position
// and their current active job, then draws the same live route + Google
// Directions/traffic-aware ETA between the two.
export function DriverLiveMap({ driverId }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const mapRef = useRef<MapView>(null);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [destinationLabel, setDestinationLabel] = useState<string | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noActiveJob, setNoActiveJob] = useState(false);
  // A job's destination address is typically static for the whole delivery —
  // skip re-geocoding (a paid API call) on every 25s poll when it hasn't
  // actually changed since the last one.
  const lastGeocodedAddress = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [location, jobsRes] = await Promise.all([
          api.get<DriverLocationDetail>(`/api/drivers/${driverId}/location`),
          api.get<{ jobs: Job[] }>(`/api/jobs?driverId=${driverId}`),
        ]);
        if (cancelled) return;

        if (location.current) {
          setOrigin({ latitude: location.current.lat, longitude: location.current.lng });
        } else {
          setError("This driver has no recorded position yet.");
        }

        const activeJob = jobsRes.jobs.find((j) =>
          ["ACCEPTED", "ARRIVED", "PICKED_UP", "ON_THE_WAY"].includes(j.status)
        );
        const dest = activeJob ? routeDestination(activeJob) : null;
        if (dest) {
          setNoActiveJob(false);
          setDestinationLabel(dest.label);
          if (dest.address !== lastGeocodedAddress.current) {
            const coords = await geocodeAddress(dest.address);
            if (!cancelled && coords) {
              lastGeocodedAddress.current = dest.address;
              setDestination(coords);
            }
          }
        } else {
          setNoActiveJob(true);
          setDestination(null);
          lastGeocodedAddress.current = null;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load this driver's location");
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [driverId]);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Map unavailable (no Google Maps API key configured).</Text>
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

  if (!origin) {
    return (
      <View style={[styles.fallback, styles.loading]}>
        <Text style={styles.fallbackText}>Locating driver…</Text>
      </View>
    );
  }

  if (noActiveJob) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Driver's last known position — no active job to route to right now.</Text>
        <MapView provider={PROVIDER_GOOGLE} style={styles.soloMap} initialRegion={toRegion(origin)}>
          <Marker coordinate={origin} title="Driver" />
        </MapView>
      </View>
    );
  }

  if (!destination) {
    return (
      <View style={[styles.fallback, styles.loading]}>
        <Text style={styles.fallbackText}>Locating {(destinationLabel ?? "destination").toLowerCase()}…</Text>
      </View>
    );
  }

  return (
    <View style={styles.mapWrapper}>
      {etaMinutes != null && (
        <View style={styles.etaBadge}>
          <Ionicons name="time" size={14} color={colors.primaryText} />
          <Text style={styles.etaText}>{etaMinutes} min (traffic-aware)</Text>
        </View>
      )}
      <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={toRegion(origin)}>
        <Marker coordinate={origin} title="Driver" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.driverMarker}>
            <Ionicons name="navigate" size={14} color={colors.primaryText} />
          </View>
        </Marker>
        <Marker coordinate={destination} title={destinationLabel ?? "Destination"} pinColor={colors.primary} />
        <MapViewDirections
          origin={origin}
          destination={destination}
          apikey={GOOGLE_MAPS_API_KEY}
          timePrecision="now"
          strokeWidth={4}
          strokeColor={colors.primary}
          onReady={(result) => {
            setEtaMinutes(Math.round(result.duration));
            mapRef.current?.fitToCoordinates(result.coordinates, {
              edgePadding: EDGE_PADDING,
              animated: true,
            });
          }}
          onError={() => {
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

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  mapWrapper: {
    position: "relative",
    height: 280,
    borderRadius: 12,
    overflow: "hidden",
    marginTop: spacing.sm,
  },
  map: {
    flex: 1,
  },
  soloMap: {
    height: 180,
    borderRadius: 12,
    marginTop: spacing.sm,
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
  etaBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  etaText: {
    color: colors.primaryText,
    fontSize: 12,
    fontWeight: "700",
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
  });
}
