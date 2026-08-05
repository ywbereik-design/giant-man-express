import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Driver, TimeEntry } from "../../api/types";
import { Card, CenteredSpinner, ErrorText, Label, SectionTitle } from "../../components/ui";
import { ChipSelect } from "../../components/ChipSelect";
import { PhotoThumbnail } from "../../components/PhotoViewer";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

export function SelfieReportsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDrivers = useCallback(async () => {
    try {
      const res = await api.get<{ drivers: Driver[] }>("/api/drivers");
      setDrivers(res.drivers);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load drivers");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDrivers();
    }, [loadDrivers])
  );

  async function selectDriver(id: string) {
    setDriverId(id);
    setError(null);
    setEntriesLoading(true);
    try {
      const res = await api.get<{ entries: TimeEntry[] }>(`/api/drivers/${id}/time-entries`);
      setEntries(res.entries);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load selfie history");
    } finally {
      setEntriesLoading(false);
    }
  }

  if (initialLoading) return <CenteredSpinner />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md }}
      data={driverId ? entries : []}
      keyExtractor={(e) => e.id}
      ListHeaderComponent={
        <View>
          <SectionTitle>Selfie Reports</SectionTitle>
          <Text style={styles.hint}>Every clock-in selfie for a driver, by the day it was taken.</Text>
          <Card>
            <Label>Driver</Label>
            <ChipSelect
              options={drivers.map((d) => ({ id: d.id, label: d.name }))}
              selectedId={driverId}
              onSelect={selectDriver}
            />
          </Card>
          <ErrorText>{error}</ErrorText>
          {entriesLoading && <CenteredSpinner />}
        </View>
      }
      ListEmptyComponent={
        error ? null : !entriesLoading && driverId ? (
          <Text style={styles.empty}>No shifts recorded for this driver yet.</Text>
        ) : !entriesLoading && !driverId ? (
          <Text style={styles.empty}>Choose a driver to see their selfie history.</Text>
        ) : null
      }
      renderItem={({ item }) => (
        <Card>
          <View style={styles.row}>
            {item.clockInPhoto ? (
              <PhotoThumbnail uri={item.clockInPhoto} />
            ) : (
              <View style={[styles.thumbnail, styles.thumbnailEmpty]}>
                <Text style={styles.thumbnailEmptyText}>N/A</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.date}>
                {new Date(item.clockInAt).toLocaleDateString("en-CA", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
              <Text style={styles.meta}>
                Clocked in {new Date(item.clockInAt).toLocaleTimeString("en-CA")}
                {item.clockOutAt ? ` – out ${new Date(item.clockOutAt).toLocaleTimeString("en-CA")}` : " (in progress)"}
              </Text>
            </View>
          </View>
        </Card>
      )}
    />
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  hint: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  date: { color: colors.text, fontSize: 15, fontWeight: "700" },
  meta: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
  thumbnail: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  thumbnailEmpty: { alignItems: "center", justifyContent: "center" },
  thumbnailEmptyText: { color: colors.textMuted, fontSize: 11 },
  });
}
