import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError } from "../api/client";
import { Job, DriverLocationDetail } from "../api/types";
import { spacing, ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import { GOOGLE_MAPS_API_KEY, LatLng, geocodeAddress } from "../lib/googleMaps";
import { routeDestination } from "../lib/routeDestination";
import { IN_PROGRESS_STATUSES } from "../lib/jobStatus";
import { LiveRouteMap, MapFallback, toMapRegion } from "./LiveRouteMap";

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
// Directions/traffic-aware ETA between the two (see LiveRouteMap, shared by
// both).
export function DriverLiveMap({ driverId }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [destinationLabel, setDestinationLabel] = useState<string | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noActiveJob, setNoActiveJob] = useState(false);
  // Distinct from "still on the first attempt" — geocodeAddress swallows
  // its own failures and returns null, and without this the component was
  // stuck showing a plain "Locating…" forever on persistent failure with no
  // indication anything was wrong. The 25s poll loop already retries
  // automatically (a failed address is never recorded into
  // lastGeocodedAddress), so this only needs to surface honest status, not
  // add a manual retry.
  const [geocodeFailed, setGeocodeFailed] = useState(false);
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

        const activeJob = jobsRes.jobs.find((j) => IN_PROGRESS_STATUSES.includes(j.status));
        const dest = activeJob ? routeDestination(activeJob) : null;
        if (dest) {
          setNoActiveJob(false);
          setDestinationLabel(dest.label);
          if (dest.address !== lastGeocodedAddress.current) {
            const coords = await geocodeAddress(dest.address);
            if (cancelled) return;
            if (coords) {
              lastGeocodedAddress.current = dest.address;
              setDestination(coords);
              setGeocodeFailed(false);
            } else {
              setGeocodeFailed(true);
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
      <MapFallback>
        <Text style={styles.fallbackText}>Map unavailable (no Google Maps API key configured).</Text>
      </MapFallback>
    );
  }

  if (error) {
    return (
      <MapFallback>
        <Text style={styles.fallbackText}>{error}</Text>
      </MapFallback>
    );
  }

  if (!origin) {
    return (
      <MapFallback centered>
        <Text style={styles.fallbackText}>Locating driver…</Text>
      </MapFallback>
    );
  }

  if (noActiveJob) {
    return (
      <MapFallback>
        <Text style={styles.fallbackText}>Driver's last known position — no active job to route to right now.</Text>
        <MapView provider={PROVIDER_GOOGLE} style={styles.soloMap} initialRegion={toMapRegion(origin)}>
          <Marker coordinate={origin} title="Driver" />
        </MapView>
      </MapFallback>
    );
  }

  if (!destination) {
    return (
      <MapFallback centered>
        <Text style={styles.fallbackText}>
          {geocodeFailed
            ? `Couldn't map ${(destinationLabel ?? "the destination").toLowerCase()} — retrying automatically.`
            : `Locating ${(destinationLabel ?? "destination").toLowerCase()}…`}
        </Text>
      </MapFallback>
    );
  }

  return (
    <LiveRouteMap
      origin={origin}
      destination={destination}
      destinationLabel={destinationLabel ?? "Destination"}
      originTitle="Driver"
      timePrecision="now"
      onDirectionsReady={setEtaMinutes}
      overlay={
        etaMinutes != null && (
          <View style={styles.etaBadge}>
            <Ionicons name="time" size={14} color={colors.primaryText} />
            <Text style={styles.etaText}>{etaMinutes} min (traffic-aware)</Text>
          </View>
        )
      }
    />
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    soloMap: {
      height: 180,
      borderRadius: 12,
      marginTop: spacing.sm,
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
    fallbackText: {
      color: colors.textMuted,
      fontSize: 13,
    },
  });
}
