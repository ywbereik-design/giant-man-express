import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, SectionList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { TimeEntry } from "../../api/types";
import { Card, CenteredSpinner, ErrorText } from "../../components/ui";
import { colors, spacing } from "../../theme/theme";
import { useDriverTabBarHeight } from "../../navigation/DriverTabBarHeightContext";

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
    const day = new Date(entry.clockInAt).toLocaleDateString("en-CA", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const existing = groups.get(day);
    if (existing) existing.push(entry);
    else groups.set(day, [entry]);
  }
  return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
}

export function HistoryScreen() {
  const tabBarHeight = useDriverTabBarHeight();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ entries: TimeEntry[] }>("/api/driver/time-entries");
      setEntries(res.entries);
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
        ListEmptyComponent={<Text style={styles.empty}>No shifts recorded yet.</Text>}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.times}>
              {new Date(item.clockInAt).toLocaleTimeString("en-CA")} — {item.clockOutAt ? new Date(item.clockOutAt).toLocaleTimeString("en-CA") : "—"}
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

const styles = StyleSheet.create({
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
