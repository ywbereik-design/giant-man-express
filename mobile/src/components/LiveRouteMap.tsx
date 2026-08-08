import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { spacing, ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import { LatLng, fetchRoute } from "../lib/osm";

// Bounds for the adaptive height below — proportional to the screen instead
// of a fixed pixel value, so the map reads about the same size on a small
// phone and a tablet, but never gets cramped (MIN) or absurdly tall (MAX)
// at either extreme.
const MIN_MAP_HEIGHT = 220;
const MAX_MAP_HEIGHT = 340;
const MAP_HEIGHT_FRACTION = 0.32;

const LEAFLET_VERSION = "1.9.4";

export interface LiveRouteMapProps {
  origin: LatLng;
  // Omitted for DriverLiveMap's "no active job" case — just shows the
  // origin marker, no destination/route.
  destination?: LatLng | null;
  destinationLabel?: string;
  originTitle?: string;
  // Defaults to a screen-proportional height (see MAP_HEIGHT_FRACTION) —
  // only pass this to override that for a specific layout.
  height?: number;
  onDirectionsReady?: (durationMinutes: number) => void;
  // Absolutely-positioned content over the map (the ETA badge) — kept as a
  // slot rather than a fixed prop so this component doesn't need to know
  // what an ETA badge looks like.
  overlay?: React.ReactNode;
}

// A Leaflet map (OpenStreetMap tiles, no API key) rendered inside a WebView —
// shared by DriverRouteMap (a driver's own live GPS route) and DriverLiveMap
// (a third party's, polled from the backend). The page itself is built once
// per theme change (colors are baked into its CSS) and stays mounted after
// that; origin/destination/route updates are pushed into the already-loaded
// page via injectJavaScript instead of reloading it, so panning/zoom state
// and the map's tile cache survive a poll or a GPS tick. Owns its own route
// fetch (OSRM) internally, the same way MapViewDirections used to.
export function LiveRouteMap({
  origin,
  destination,
  destinationLabel = "Destination",
  originTitle = "You",
  height,
  onDirectionsReady,
  overlay,
}: LiveRouteMapProps) {
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const resolvedHeight =
    height ?? Math.round(Math.min(MAX_MAP_HEIGHT, Math.max(MIN_MAP_HEIGHT, windowHeight * MAP_HEIGHT_FRACTION)));
  const styles = useMemo(() => makeStyles(colors, resolvedHeight), [colors, resolvedHeight]);
  const webviewRef = useRef<WebView>(null);
  const mapReady = useRef(false);
  const [routeCoords, setRouteCoords] = useState<LatLng[] | null>(null);

  const html = useMemo(() => buildMapHtml(colors), [colors]);

  // The page reloads whenever `html` changes (a theme toggle) — reset the
  // ready flag so pushUpdate() doesn't fire injectJavaScript at a page
  // that's mid-reload and hasn't announced itself again yet.
  useEffect(() => {
    mapReady.current = false;
  }, [html]);

  // Fetches the OSRM driving route whenever origin/destination move — the
  // same responsibility MapViewDirections used to own internally for the
  // Google version. Cleared immediately (not just on the new fetch
  // resolving) so a destination change never briefly shows a route line
  // pointing at the OLD destination while the new one loads.
  useEffect(() => {
    setRouteCoords(null);
    if (!destination) return;
    let cancelled = false;
    fetchRoute(origin, destination).then((result) => {
      if (cancelled) return;
      if (result) {
        setRouteCoords(result.coordinates);
        onDirectionsReady?.(result.durationMinutes);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.latitude, origin.longitude, destination?.latitude, destination?.longitude]);

  function pushUpdate() {
    if (!mapReady.current) return;
    const destLat = destination ? destination.latitude : 0;
    const destLng = destination ? destination.longitude : 0;
    const routeArg = routeCoords ? JSON.stringify(routeCoords.map((c) => [c.latitude, c.longitude])) : "null";
    const script = `updateMap(${origin.latitude}, ${origin.longitude}, ${destination ? 1 : 0}, ${destLat}, ${destLng}, ${JSON.stringify(
      destinationLabel
    )}, ${JSON.stringify(originTitle)}, ${routeArg}); true;`;
    webviewRef.current?.injectJavaScript(script);
  }

  useEffect(() => {
    pushUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.latitude, origin.longitude, destination?.latitude, destination?.longitude, destinationLabel, originTitle, routeCoords]);

  function handleMessage(event: WebViewMessageEvent) {
    if (event.nativeEvent.data === "ready") {
      mapReady.current = true;
      pushUpdate();
    }
  }

  return (
    <View style={styles.mapWrapper}>
      {overlay}
      <WebView
        ref={webviewRef}
        source={{ html }}
        style={styles.map}
        originWhitelist={["*"]}
        onMessage={handleMessage}
      />
    </View>
  );
}

// Builds the whole map page fresh (Leaflet + OSM tiles loaded from CDN,
// colors baked into its CSS) — cheap enough to only happen on theme
// changes, since origin/destination/route updates after that go through
// injectJavaScript instead of a reload (see the effect above).
function buildMapHtml(colors: ThemeColors): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: ${colors.surfaceAlt}; }
  .origin-marker {
    width: 28px; height: 28px; border-radius: 14px;
    background: ${colors.primary}; border: 2px solid ${colors.primaryText};
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  }
  .origin-marker-dot { width: 8px; height: 8px; border-radius: 4px; background: ${colors.primaryText}; }
  .dest-marker { font-size: 30px; line-height: 30px; text-shadow: 0 1px 3px rgba(0,0,0,0.5); }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js"></script>
<script>
  var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([0, 0], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  var originIcon = L.divIcon({
    className: '',
    html: '<div class="origin-marker"><div class="origin-marker-dot"></div></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
  var destIcon = L.divIcon({
    className: '',
    html: '<div class="dest-marker">📍</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 28]
  });

  var originMarker = null;
  var destMarker = null;
  var routeLine = null;

  function updateMap(originLat, originLng, hasDest, destLat, destLng, destLabel, originLabel, routeCoords) {
    var originLatLng = [originLat, originLng];
    if (!originMarker) {
      originMarker = L.marker(originLatLng, { icon: originIcon }).addTo(map);
    } else {
      originMarker.setLatLng(originLatLng);
    }
    originMarker.bindPopup(originLabel);

    var bounds = [originLatLng];

    if (hasDest) {
      var destLatLng = [destLat, destLng];
      if (!destMarker) {
        destMarker = L.marker(destLatLng, { icon: destIcon }).addTo(map);
      } else {
        destMarker.setLatLng(destLatLng);
      }
      destMarker.bindPopup(destLabel);
      bounds.push(destLatLng);
    } else if (destMarker) {
      map.removeLayer(destMarker);
      destMarker = null;
    }

    if (routeLine) {
      map.removeLayer(routeLine);
      routeLine = null;
    }
    if (routeCoords && routeCoords.length > 1) {
      routeLine = L.polyline(routeCoords, { color: '${colors.primary}', weight: 4 }).addTo(map);
      bounds = routeCoords;
    }

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [48, 48] });
    } else {
      map.setView(bounds[0], 15);
    }
  }

  window.updateMap = updateMap;
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage('ready');
  }
</script>
</body>
</html>`;
}

// Shared shell for every non-map state these two components render: a
// permission/network error, still geocoding, or a geocode failure (with or
// without a retry button) — each caller supplies its own message/children,
// this just owns the consistent card styling.
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
      backgroundColor: colors.surfaceAlt,
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
