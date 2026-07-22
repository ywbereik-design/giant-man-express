import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { TimeEntry } from "../../api/types";
import { Card, CenteredSpinner, ErrorText } from "../../components/ui";
import { colors, spacing } from "../../theme/theme";

function hoursBetween(a: string, b: string | null): string {
  if (!b) return "in progress";
  const hrs = (new Date(b).getTime() - new Date(a).getTime()) / 3600000;
  return `${hrs.toFixed(2)} hrs`;
}

export function HistoryScreen() {
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

  if (initialLoading) return <CenteredSpinner />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        contentContainerStyle={{ padding: spacing.md }}
        data={entries}
        keyExtractor={(e) => e.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={async () => { setLoading(true); await load(); setLoading(false); }} tintColor={colors.primary} />}
        ListHeaderComponent={<ErrorText>{error}</ErrorText>}
        ListEmptyComponent={<Text style={styles.empty}>No shifts recorded yet.</Text>}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.date}>{new Date(item.clockInAt).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}</Text>
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
  date: { color: colors.text, fontWeight: "700", marginBottom: spacing.xs },
  times: { color: colors.textMuted },
  hours: { color: colors.primary, marginTop: spacing.xs, fontWeight: "600" },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
});
