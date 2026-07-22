import React, { useCallback, useState } from "react";
import { Alert, FlatList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Driver, HoursReport } from "../../api/types";
import { Button, Card, CenteredSpinner, ErrorText, Label, SectionTitle } from "../../components/ui";
import { ChipSelect } from "../../components/ChipSelect";
import { colors, spacing } from "../../theme/theme";
import { presetRanges, formatRange, DateRange } from "../../lib/dateRange";
import { downloadAndSharePdf } from "../../lib/downloadAndShare";
import { useAuth } from "../../auth/AuthContext";

export function ReportsScreen() {
  const { session } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [reports, setReports] = useState<HoursReport[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [driverId, setDriverId] = useState<string | null>(null);
  const ranges = presetRanges();
  const [range, setRange] = useState<DateRange>(ranges[1]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [driversRes, reportsRes] = await Promise.all([
        api.get<{ drivers: Driver[] }>("/api/drivers"),
        api.get<{ reports: HoursReport[] }>("/api/reports"),
      ]);
      setDrivers(driversRes.drivers.filter((d) => d.active));
      setReports(reportsRes.reports);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load reports");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function generate() {
    setError(null);
    if (!driverId) {
      setError("Choose a driver");
      return;
    }
    setGenerating(true);
    try {
      await api.post("/api/reports", {
        driverId,
        periodStart: range.start.toISOString(),
        periodEnd: range.end.toISOString(),
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not generate report");
    } finally {
      setGenerating(false);
    }
  }

  async function share(report: HoursReport) {
    if (!session) return;
    setSharingId(report.id);
    try {
      await downloadAndSharePdf(`/api/reports/${report.id}/pdf`, session.token, `${report.reportNumber}.pdf`);
    } catch {
      Alert.alert("Could not open the PDF", "Check your connection and try again.");
    } finally {
      setSharingId(null);
    }
  }

  if (initialLoading) return <CenteredSpinner />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md }}
      data={reports}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={
        <View>
          <SectionTitle>Generate Hours Report</SectionTitle>
          <Card>
            <Label>Driver</Label>
            <ChipSelect
              options={drivers.map((d) => ({ id: d.id, label: d.name }))}
              selectedId={driverId}
              onSelect={setDriverId}
            />
            <Label>Period</Label>
            <ChipSelect
              options={ranges.map((r) => ({ id: r.label, label: `${r.label} (${formatRange(r)})` }))}
              selectedId={range.label}
              onSelect={(id) => setRange(ranges.find((r) => r.label === id) ?? ranges[0])}
            />
            <ErrorText>{error}</ErrorText>
            <Button title="Generate Report" onPress={generate} loading={generating} />
          </Card>
          <SectionTitle>Generated Reports</SectionTitle>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>No reports generated yet.</Text>}
      renderItem={({ item }) => (
        <Card>
          <Text style={styles.number}>{item.reportNumber}</Text>
          <Text style={styles.meta}>
            {item.driver?.name} ({item.driver?.employeeCode})
          </Text>
          <Text style={styles.meta}>
            {new Date(item.periodStart).toLocaleDateString("en-CA")} – {new Date(item.periodEnd).toLocaleDateString("en-CA")}
          </Text>
          <Text style={styles.hours}>{item.totalHours.toFixed(2)} hrs total</Text>
          <View style={{ marginTop: spacing.sm }}>
            <Button title="Share / Save PDF" variant="secondary" onPress={() => share(item)} loading={sharingId === item.id} />
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  number: { color: colors.primary, fontWeight: "800", fontSize: 16 },
  meta: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  hours: { color: colors.text, marginTop: spacing.xs, fontWeight: "600" },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
});
