import React, { memo, useCallback, useMemo } from "react";
import { FlatList, Text, View, StyleSheet } from "react-native";
import { api } from "../../api/client";
import { Driver, HoursReport } from "../../api/types";
import { Button, Card, CenteredSpinner, ErrorText, Label, SectionTitle } from "../../components/ui";
import { ChipSelect } from "../../components/ChipSelect";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { formatRange, formatDate } from "../../lib/dateRange";
import { useGeneratedDocument } from "../../lib/useGeneratedDocument";

// Memoized so typing in the "Generate Hours Report" form above doesn't
// re-render every already-generated report card — mirrors the DriverRow
// pattern in DriversScreen.tsx.
const ReportRow = memo(function ReportRow({
  item,
  isSharing,
  onShare,
}: {
  item: HoursReport;
  isSharing: boolean;
  onShare: (item: HoursReport) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card>
      <Text style={styles.number}>{item.reportNumber}</Text>
      <Text style={styles.meta}>
        {item.driver?.name} ({item.driver?.employeeCode})
      </Text>
      <Text style={styles.meta}>
        {formatDate(item.periodStart)} – {formatDate(item.periodEnd)}
      </Text>
      <View style={styles.statsRow}>
        <Text style={styles.hours}>{item.totalHours.toFixed(2)} hrs</Text>
        <Text style={styles.distance}>{item.totalDistanceKm.toFixed(1)} km</Text>
      </View>
      <View style={{ marginTop: spacing.sm }}>
        <Button title="Share / Save PDF" variant="secondary" onPress={() => onShare(item)} loading={isSharing} />
      </View>
    </Card>
  );
});

export function ReportsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const loadPickerOptions = useCallback(async () => {
    const res = await api.get<{ drivers: Driver[] }>("/api/drivers");
    return res.drivers.filter((d) => d.active).map((d) => ({ id: d.id, label: d.name }));
  }, []);
  const loadItems = useCallback(async (cursor?: string) => {
    const res = await api.get<{ reports: HoursReport[]; nextCursor: string | null }>(
      `/api/reports${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
    );
    return { items: res.reports, nextCursor: res.nextCursor };
  }, []);
  const generateDocument = useCallback(
    async (driverId: string, range: { start: Date; end: Date }) => {
      const res = await api.post<{ report: HoursReport }>("/api/reports", {
        driverId,
        periodStart: range.start.toISOString(),
        periodEnd: range.end.toISOString(),
      });
      return res.report;
    },
    []
  );
  const getItemId = useCallback((r: HoursReport) => r.id, []);
  const pdfPath = useCallback((r: HoursReport) => `/api/reports/${r.id}/pdf`, []);
  const pdfFilename = useCallback((r: HoursReport) => `${r.reportNumber}.pdf`, []);

  const doc = useGeneratedDocument<HoursReport>({
    loadPickerOptions,
    loadItems,
    getItemId,
    generateDocument,
    pdfPath,
    pdfFilename,
    pickerMissingMessage: "Choose a driver",
    loadErrorFallback: "Could not load reports",
    generateErrorFallback: "Could not generate report",
  });

  const renderItem = useCallback(
    ({ item }: { item: HoursReport }) => (
      <ReportRow item={item} isSharing={doc.sharingId === item.id} onShare={doc.share} />
    ),
    [doc.sharingId, doc.share]
  );

  if (doc.initialLoading) return <CenteredSpinner />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md }}
      data={doc.items}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={
        <View>
          <SectionTitle>Generate Hours Report</SectionTitle>
          <Card>
            <Label>Driver</Label>
            <ChipSelect options={doc.pickerOptions} selectedId={doc.pickerId} onSelect={doc.setPickerId} />
            <Label>Period</Label>
            <ChipSelect
              options={doc.ranges.map((r) => ({ id: r.label, label: `${r.label} (${formatRange(r)})` }))}
              selectedId={doc.range.label}
              onSelect={(id) => doc.setRange(doc.ranges.find((r) => r.label === id) ?? doc.ranges[0])}
            />
            <ErrorText>{doc.error}</ErrorText>
            <Button title="Generate Report" onPress={doc.generate} loading={doc.generating} />
          </Card>
          <SectionTitle>Generated Reports</SectionTitle>
        </View>
      }
      ListEmptyComponent={!doc.error ? <Text style={styles.empty}>No reports generated yet.</Text> : null}
      ListFooterComponent={
        doc.hasMore ? (
          <View style={{ marginTop: spacing.sm }}>
            <Button title="Load More" variant="secondary" onPress={doc.loadMore} loading={doc.loadingMore} />
          </View>
        ) : null
      }
      renderItem={renderItem}
    />
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  number: { color: colors.primary, fontWeight: "800", fontSize: 16 },
  meta: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  statsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  hours: { color: colors.text, fontWeight: "600" },
  distance: { color: colors.textMuted, fontWeight: "600" },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
  });
}
