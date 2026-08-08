import React, { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Business, Driver, HoursByBusinessRow as HoursByBusinessRowData } from "../../api/types";
import { Button, Card, CenteredSpinner, ErrorText, Label, SectionTitle } from "../../components/ui";
import { ChipSelect } from "../../components/ChipSelect";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { presetRanges, formatRange, DateRange } from "../../lib/dateRange";

// Memoized so typing/re-querying the picker form above doesn't re-render
// every already-loaded row — mirrors the DriverRow pattern in
// DriversScreen.tsx. No per-row callbacks here (this list is read-only), so
// unlike ReportRow/InvoiceRow there's nothing else to stabilize.
const HoursByBusinessRow = memo(function HoursByBusinessRow({ item }: { item: HoursByBusinessRowData }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card>
      <Text style={styles.business}>{item.businessName}</Text>
      <Text style={styles.meta}>{item.driverName}</Text>
      <View style={styles.statsRow}>
        <Text style={styles.hours}>{item.totalHours.toFixed(2)} hrs</Text>
        <Text style={styles.jobCount}>
          {item.jobCount} job{item.jobCount === 1 ? "" : "s"}
        </Text>
      </View>
    </Card>
  );
});

// Live, read-only view of hours worked per client — a billing *reference*
// derived from each job's own pickedUpAt->deliveredAt window, not a
// generated/numbered document like Hours Reports or Invoices, so there's no
// "generate"/PDF step here, just a picker + a query.
export function HoursByBusinessScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const ranges = presetRanges();
  const [range, setRange] = useState<DateRange>(ranges[1]);
  const [rows, setRows] = useState<HoursByBusinessRowData[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOptions = useCallback(async () => {
    try {
      const [businessesRes, driversRes] = await Promise.all([
        api.get<{ businesses: Business[] }>("/api/businesses"),
        api.get<{ drivers: Driver[] }>("/api/drivers"),
      ]);
      setBusinesses(businessesRes.businesses);
      setDrivers(driversRes.drivers.filter((d) => d.active));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load businesses/drivers");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOptions();
    }, [loadOptions])
  );

  async function query() {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        periodStart: range.start.toISOString(),
        periodEnd: range.end.toISOString(),
      });
      if (businessId) params.set("businessId", businessId);
      if (driverId) params.set("driverId", driverId);
      const res = await api.get<{ rows: HoursByBusinessRowData[] }>(`/api/reports/hours-by-business?${params}`);
      setRows(res.rows);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load hours by client");
    } finally {
      setLoading(false);
    }
  }

  const renderItem = useCallback(({ item }: { item: HoursByBusinessRowData }) => <HoursByBusinessRow item={item} />, []);

  if (initialLoading) return <CenteredSpinner />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md }}
      data={rows}
      keyExtractor={(r) => `${r.businessId}:${r.driverId}`}
      ListHeaderComponent={
        <View>
          <SectionTitle>Hours by Client</SectionTitle>
          <Text style={styles.hint}>
            Driver hours spent per client, derived from each job's pickup-to-delivery window — a billing reference,
            separate from generated Invoices.
          </Text>
          <Card>
            <Label>Client (optional)</Label>
            <ChipSelect
              options={businesses.map((b) => ({ id: b.id, label: b.name }))}
              selectedId={businessId}
              onSelect={(id) => setBusinessId(id === businessId ? null : id)}
            />
            <Label>Driver (optional)</Label>
            <ChipSelect
              options={drivers.map((d) => ({ id: d.id, label: d.name }))}
              selectedId={driverId}
              onSelect={(id) => setDriverId(id === driverId ? null : id)}
            />
            <Label>Period</Label>
            <ChipSelect
              options={ranges.map((r) => ({ id: r.label, label: `${r.label} (${formatRange(r)})` }))}
              selectedId={range.label}
              onSelect={(id) => setRange(ranges.find((r) => r.label === id) ?? ranges[0])}
            />
            <ErrorText>{error}</ErrorText>
            <Button title="Load Hours" onPress={query} loading={loading} />
          </Card>
        </View>
      }
      ListEmptyComponent={!error ? <Text style={styles.empty}>No results — choose a period and load hours.</Text> : null}
      renderItem={renderItem}
    />
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  hint: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm },
  business: { color: colors.primary, fontWeight: "800", fontSize: 16 },
  meta: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  statsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  hours: { color: colors.text, fontWeight: "600" },
  jobCount: { color: colors.textMuted, fontWeight: "600" },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
  });
}
