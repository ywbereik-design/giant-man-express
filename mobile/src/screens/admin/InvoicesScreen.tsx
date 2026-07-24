import React, { useCallback, useState } from "react";
import { Alert, FlatList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Business, Invoice } from "../../api/types";
import { Button, Card, CenteredSpinner, ErrorText, Label, SectionTitle } from "../../components/ui";
import { ChipSelect } from "../../components/ChipSelect";
import { colors, spacing } from "../../theme/theme";
import { presetRanges, formatRange, DateRange } from "../../lib/dateRange";
import { downloadAndSharePdf } from "../../lib/downloadAndShare";
import { useAuth } from "../../auth/AuthContext";

export function InvoicesScreen() {
  const { session } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const ranges = presetRanges();
  const [range, setRange] = useState<DateRange>(ranges[1]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [businessesRes, invoicesRes] = await Promise.all([
        api.get<{ businesses: Business[] }>("/api/businesses"),
        api.get<{ invoices: Invoice[] }>("/api/invoices"),
      ]);
      setBusinesses(businessesRes.businesses);
      setInvoices(invoicesRes.invoices);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load invoices");
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
    if (!businessId) {
      setError("Choose a business");
      return;
    }
    setGenerating(true);
    try {
      await api.post("/api/invoices", {
        businessId,
        periodStart: range.start.toISOString(),
        periodEnd: range.end.toISOString(),
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not generate invoice");
    } finally {
      setGenerating(false);
    }
  }

  async function share(invoice: Invoice) {
    if (!session) return;
    setSharingId(invoice.id);
    try {
      await downloadAndSharePdf(`/api/invoices/${invoice.id}/pdf`, session.token, `${invoice.invoiceNumber}.pdf`);
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
      data={invoices}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={
        <View>
          <SectionTitle>Generate Invoice</SectionTitle>
          <Card>
            <Label>Business</Label>
            <ChipSelect
              options={businesses.map((b) => ({ id: b.id, label: b.name }))}
              selectedId={businessId}
              onSelect={setBusinessId}
            />
            <Label>Period (completed jobs in range are billed)</Label>
            <ChipSelect
              options={ranges.map((r) => ({ id: r.label, label: `${r.label} (${formatRange(r)})` }))}
              selectedId={range.label}
              onSelect={(id) => setRange(ranges.find((r) => r.label === id) ?? ranges[0])}
            />
            <ErrorText>{error}</ErrorText>
            <Button title="Generate Invoice" onPress={generate} loading={generating} />
          </Card>
          <Text style={styles.hint}>
            Ready invoices can be shared straight to your accountant's email, Slack, or wherever you send files
            from your phone.
          </Text>
          <SectionTitle>Generated Invoices</SectionTitle>
        </View>
      }
      ListEmptyComponent={!error ? <Text style={styles.empty}>No invoices generated yet.</Text> : null}
      renderItem={({ item }) => (
        <Card>
          <Text style={styles.number}>{item.invoiceNumber}</Text>
          <Text style={styles.meta}>{item.business?.name}</Text>
          <Text style={styles.meta}>
            {new Date(item.periodStart).toLocaleDateString("en-CA")} – {new Date(item.periodEnd).toLocaleDateString("en-CA")}
          </Text>
          <Text style={styles.amount}>${item.totalAmount.toFixed(2)}</Text>
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
  amount: { color: colors.text, marginTop: spacing.xs, fontWeight: "700", fontSize: 16 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
  hint: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.md },
});
