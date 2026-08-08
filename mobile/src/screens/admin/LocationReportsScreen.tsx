import React, { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Driver, DriverLocationDetail } from "../../api/types";
import { Badge, Card, CenteredSpinner, ErrorText, SectionTitle } from "../../components/ui";
import { DriverLiveMap } from "../../components/DriverLiveMap";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { formatTime } from "../../lib/dateRange";

// Memoized so an unrelated state change elsewhere on screen (e.g. a
// different row expanding, or the top-level error banner) doesn't
// re-render every driver row — and, critically, doesn't remount every
// expanded row's DriverLiveMap, which already has its own polling
// lifecycle to worry about. Mirrors the DriverRow pattern in
// DriversScreen.tsx.
const LocationRow = memo(function LocationRow({
  item,
  expanded,
  detail,
  isDetailLoading,
  onToggleExpand,
}: {
  item: Driver;
  expanded: boolean;
  detail: DriverLocationDetail | undefined;
  isDetailLoading: boolean;
  onToggleExpand: (driver: Driver) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card>
      <Pressable
        style={styles.row}
        onPress={() => onToggleExpand(item)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${item.name}. ${(item.todayDistanceKm ?? 0).toFixed(1)} km today. ${item.clockedIn ? "Clocked in" : "Clocked out"}`}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>{(item.todayDistanceKm ?? 0).toFixed(1)} km today</Text>
        </View>
        <Badge text={item.clockedIn ? "Clocked In" : "Clocked Out"} tone={item.clockedIn ? "success" : "muted"} />
      </Pressable>

      {expanded && (
        <View style={styles.detail}>
          {isDetailLoading && <CenteredSpinner />}
          {detail && (
            <>
              {detail.today.shifts.length === 0 ? (
                <Text style={styles.meta}>No shifts today.</Text>
              ) : (
                detail.today.shifts.map((s) => (
                  <Text key={s.id} style={styles.meta}>
                    {formatTime(s.clockInAt)} – {s.clockOutAt ? formatTime(s.clockOutAt) : "in progress"}
                    {"  ·  "}
                    {s.distanceKm.toFixed(1)} km
                  </Text>
                ))
              )}
              <Text style={styles.sectionLabel}>Live Map</Text>
              <DriverLiveMap driverId={item.id} />
            </>
          )}
        </View>
      )}
    </Card>
  );
});

export function LocationReportsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DriverLocationDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ drivers: Driver[] }>("/api/drivers");
      setDrivers(res.drivers.filter((d) => d.active));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load drivers");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleExpand = useCallback(
    async (driver: Driver) => {
      if (expandedId === driver.id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(driver.id);
      if (details[driver.id]) return;

      setDetailLoadingId(driver.id);
      try {
        const res = await api.get<DriverLocationDetail>(`/api/drivers/${driver.id}/location`);
        setDetails((prev) => ({ ...prev, [driver.id]: res }));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load location report");
      } finally {
        setDetailLoadingId(null);
      }
    },
    [expandedId, details]
  );

  const renderItem = useCallback(
    ({ item }: { item: Driver }) => (
      <LocationRow
        item={item}
        expanded={expandedId === item.id}
        detail={details[item.id]}
        isDetailLoading={detailLoadingId === item.id}
        onToggleExpand={toggleExpand}
      />
    ),
    [expandedId, details, detailLoadingId, toggleExpand]
  );

  if (initialLoading) return <CenteredSpinner />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md }}
      data={drivers}
      keyExtractor={(d) => d.id}
      ListHeaderComponent={
        <View>
          <SectionTitle>Location Reports</SectionTitle>
          <Text style={styles.hint}>Today's mileage and route per driver. Tap a driver to see the detail.</Text>
          <ErrorText>{error}</ErrorText>
        </View>
      }
      ListEmptyComponent={!error ? <Text style={styles.empty}>No active drivers yet.</Text> : null}
      renderItem={renderItem}
    />
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  hint: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { color: colors.text, fontSize: 16, fontWeight: "700" },
  meta: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
  detail: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  });
}
