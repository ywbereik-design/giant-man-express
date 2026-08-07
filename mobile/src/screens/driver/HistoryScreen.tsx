import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, SectionList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { TimeEntry } from "../../api/types";
import { Button, Card, CenteredSpinner, ErrorText } from "../../components/ui";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useDriverTabBarHeight } from "../../navigation/DriverTabBarHeightContext";
import { formatDate, formatTime } from "../../lib/dateRange";

function hoursBetween(a: string, b: string | null): string {
  if (!b) return "in progress";
  const hrs = (new Date(b).getTime() - new Date(a).getTime()) / 3600000;
  return `${hrs.toFixed(2)} hrs`;
}

// Groups shifts by the calendar day they started, newest day first — so a
// driver with weeks of history sees clear day breaks instead of one long
// wall of undifferentiated shift cards.
function groupByDay(entries: TimeEntry[]): { title: string; data: TimeEntry[] }[] {
  const groups = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const day = formatDate(entry.clockInAt, { weekday: "short", month: "short", day: "numeric" });
    const existing = groups.get(day);
    if (existing) existing.push(entry);
    else groups.set(day, [entry]);
  }
  return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
}

export function HistoryScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tabBarHeight = useDriverTabBarHeight();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ entries: TimeEntry[]; nextCursor: string | null }>("/api/driver/time-entries");
      setEntries(res.entries);
      setNextCursor(res.nextCursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load history");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.get<{ entries: TimeEntry[]; nextCursor: string | null }>(
        `/api/driver/time-entries?cursor=${encodeURIComponent(nextCursor)}`
      );
      setEntries((prev) => [...prev, ...res.entries]);
      setNextCursor(res.nextCursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load more history");
    } finally {
      setLoadingMore(false);
    }
  }

  const sections = useMemo(() => groupByDay(entries), [entries]);

  if (initialLoading) return <CenteredSpinner />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SectionList
        contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.md + tabBarHeight }}
        sections={sections}
        keyExtractor={(e) => e.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={async () => { setLoading(true); await load(); setLoading(false); }} tintColor={colors.primary} />}
        ListHeaderComponent={<ErrorText>{error}</ErrorText>}
        ListEmptyComponent={!error ? <Text style={styles.empty}>No shifts recorded yet.</Text> : null}
        ListFooterComponent={
          nextCursor ? (
            <View style={{ marginTop: spacing.sm }}>
              <Button title="Load More" variant="secondary" onPress={loadMore} loading={loadingMore} />
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.times}>
              {formatTime(item.clockInAt)} — {item.clockOutAt ? formatTime(item.clockOutAt) : "—"}
            </Text>
            <Text style={styles.hours}>
              {hoursBetween(item.clockInAt, item.clockOutAt)} · {item.distanceKm.toFixed(1)} km
            </Text>
          </Card>
        )}
      />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  sectionHeader: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  times: { color: colors.text, fontWeight: "700" },
  hours: { color: colors.primary, marginTop: spacing.xs, fontWeight: "600" },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
  });
}
