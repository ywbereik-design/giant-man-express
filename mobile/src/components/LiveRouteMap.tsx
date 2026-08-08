import React, { useMemo, useRef } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import { Ionicons } from "@expo/vector-icons";
import { spacing, ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import { GOOGLE_MAPS_API_KEY, LatLng } from "../lib/googleMaps";

export const MAP_EDGE_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

// Bounds for the adaptive height below — proportional to the screen instead
// of a fixed pixel value, so the map reads about the same size on a small
// phone and a tablet, but never gets cramped (MIN) or absurdly tall (MAX)
// at either extreme.
const MIN_MAP_HEIGHT = 220;
const MAX_MAP_HEIGHT = 340;
const MAP_HEIGHT_FRACTION = 0.32;

export function toMapRegion(point: LatLng) {
  return { ...point, latitudeDelta: 0.05, longitudeDelta: 0.05 };
}

export interface LiveRouteMapProps {
  origin: LatLng;
  destination: LatLng;
  destinationLabel: string;
  originTitle?: string;
  // Defaults to a screen-proportional height (see MAP_HEIGHT_FRACTION) —
  // only pass this to override that for a specific layout.
  height?: number;
  // Only DriverLiveMap (monitoring a third party) asks the Directions API
  // for a traffic-aware duration — a driver's own route doesn't need one.
  timePrecision?: "now";
  onDirectionsReady?: (durationMinutes: number) => void;
  // Absolutely-positioned content over the map (the ETA badge) — kept as a
  // slot rather than a fixed prop so this component doesn't need to know
  // what an ETA badge looks like.
  overlay?: React.ReactNode;
}

// The MapView + origin/destination markers + Google Directions route shared
// by DriverRouteMap (a driver's own live GPS route) and DriverLiveMap (a
// third party's, polled from the backend) — everything from here down was
// byte-for-byte identical between the two; only how origin/destination get
// populated differs, which stays in each caller. Owns its own MapView ref
// internally (for fitToCoordinates on the directions callbacks) — callers
// never need one of their own.
export function LiveRouteMap({
  origin,
  destination,
  destinationLabel,
  originTitle = "You",
  height,
  timePrecision,
  onDirectionsReady,
  overlay,
}: LiveRouteMapProps) {
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const resolvedHeight =
    height ?? Math.round(Math.min(MAX_MAP_HEIGHT, Math.max(MIN_MAP_HEIGHT, windowHeight * MAP_HEIGHT_FRACTION)));
  const styles = useMemo(() => makeStyles(colors, resolvedHeight), [colors, resolvedHeight]);
  const mapRef = useRef<MapView>(null);

  return (
    <View style={styles.mapWrapper}>
      {overlay}
      <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={toMapRegion(origin)}>
        <Marker coordinate={origin} title={originTitle} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.driverMarker}>
            <Ionicons name="navigate" size={14} color={colors.primaryText} />
          </View>
        </Marker>
        <Marker coordinate={destination} title={destinationLabel} pinColor={colors.primary} />
        <MapViewDirections
          origin={origin}
          destination={destination}
          apikey={GOOGLE_MAPS_API_KEY}
          timePrecision={timePrecision}
          strokeWidth={4}
          strokeColor={colors.primary}
          onReady={(result) => {
            onDirectionsReady?.(Math.round(result.duration));
            mapRef.current?.fitToCoordinates(result.coordinates, {
              edgePadding: MAP_EDGE_PADDING,
              animated: true,
            });
          }}
          onError={() => {
            // Directions failed (no route, quota, etc.) — still frame both
            // markers so the map isn't stuck zoomed on just the origin.
            mapRef.current?.fitToCoordinates([origin, destination], {
              edgePadding: MAP_EDGE_PADDING,
              animated: true,
            });
          }}
        />
      </MapView>
    </View>
  );
}

// Shared shell for every non-map state these two components render: no API
// key configured, a permission/network error, still geocoding, or a
// geocode failure (with or without a retry button) — each caller supplies
// its own message/children, this just owns the consistent card styling.
export function MapFallback({ centered, children }: { centered?: boolean; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors, 0), [colors]);
  return <View style={[styles.fallback, centered && styles.fallbackCentered]}>{children}</View>;
}

function makeStyles(colors: ThemeColors, height: number) {
  return StyleSheet.create({
    mapWrapper: {
      position: "relative",
      height,
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
    fallbackCentered: {
      alignItems: "center",
    },
  });
}
