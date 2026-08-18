import React, { memo, useCallback, useMemo } from "react";
import { FlatList, Text, View, StyleSheet } from "react-native";
import { api } from "../../api/client";
import { Business, Invoice, BILLING_TYPES } from "../../api/types";
import { Button, Card, CenteredSpinner, ErrorText, Label, SectionTitle } from "../../components/ui";
import { ChipSelect } from "../../components/ChipSelect";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { formatRange, formatDate } from "../../lib/dateRange";
import { useGeneratedDocument } from "../../lib/useGeneratedDocument";

// Memoized so typing in the "Generate Invoice" form above doesn't re-render
// every already-generated invoice card — mirrors the DriverRow pattern in
// DriversScreen.tsx. Only effective because doc.share is itself
// useCallback-wrapped in useGeneratedDocument.ts; otherwise this row's
// onShare prop would get a new identity every render regardless.
const InvoiceRow = memo(function InvoiceRow({
  item,
  isSharing,
  onShare,
}: {
  item: Invoice;
  isSharing: boolean;
  onShare: (item: Invoice) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card>
      <Text style={styles.number}>{item.invoiceNumber}</Text>
      <Text style={styles.meta}>{item.business?.name}</Text>
      <Text style={styles.meta}>
        {formatDate(item.periodStart)} – {formatDate(item.periodEnd)}
      </Text>
      <Text style={styles.amount}>${item.totalAmount.toFixed(2)}</Text>
      <View style={{ marginTop: spacing.sm }}>
        <Button title="Share / Save PDF" variant="secondary" onPress={() => onShare(item)} loading={isSharing} />
      </View>
    </Card>
  );
});

export function InvoicesScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const loadPickerOptions = useCallback(async () => {
    const res = await api.get<{ businesses: Business[] }>("/api/businesses");
    // Surfaces the billing type right in the picker — an accountant about to
    // generate an invoice should see up front whether this business bills
    // per trip, per hour, or a flat rate, not discover it after the fact.
    return res.businesses.map((b) => {
      const typeLabel = BILLING_TYPES.find((t) => t.id === (b.billingType ?? "PER_TRIP"))?.label;
      return { id: b.id, label: typeLabel ? `${b.name} (${typeLabel})` : b.name };
    });
  }, []);
  const loadItems = useCallback(async (cursor?: string) => {
    const res = await api.get<{ invoices: Invoice[]; nextCursor: string | null }>(
      `/api/invoices${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
    );
    return { items: res.invoices, nextCursor: res.nextCursor };
  }, []);
  const generateDocument = useCallback(
    async (businessId: string, range: { start: Date; end: Date }) => {
      const res = await api.post<{ invoice: Invoice }>("/api/invoices", {
        businessId,
        periodStart: range.start.toISOString(),
        periodEnd: range.end.toISOString(),
      });
      return res.invoice;
    },
    []
  );
  const getItemId = useCallback((i: Invoice) => i.id, []);
  const pdfPath = useCallback((i: Invoice) => `/api/invoices/${i.id}/pdf`, []);
  const pdfFilename = useCallback((i: Invoice) => `${i.invoiceNumber}.pdf`, []);

  const doc = useGeneratedDocument<Invoice>({
    loadPickerOptions,
    loadItems,
    getItemId,
    generateDocument,
    pdfPath,
    pdfFilename,
    pickerMissingMessage: "Choose a business",
    loadErrorFallback: "Could not load invoices",
    generateErrorFallback: "Could not generate invoice",
  });

  const renderItem = useCallback(
    ({ item }: { item: Invoice }) => (
      <InvoiceRow item={item} isSharing={doc.sharingId === item.id} onShare={doc.share} />
    ),
    [doc.sharingId, doc.share]
  );

  if (doc.initialLoading) return <CenteredSpinner />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md }}
      data={doc.items}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={
        <View>
          <SectionTitle>Generate Invoice</SectionTitle>
          <Card>
            <Label>Business</Label>
            <ChipSelect options={doc.pickerOptions} selectedId={doc.pickerId} onSelect={doc.setPickerId} />
            <Label>Period (completed jobs in range are billed)</Label>
            <ChipSelect
              options={doc.ranges.map((r) => ({ id: r.label, label: `${r.label} (${formatRange(r)})` }))}
              selectedId={doc.range.label}
              onSelect={(id) => doc.setRange(doc.ranges.find((r) => r.label === id) ?? doc.ranges[0])}
            />
            <ErrorText>{doc.error}</ErrorText>
            <Button title="Generate Invoice" onPress={doc.generate} loading={doc.generating} />
          </Card>
          <Text style={styles.hint}>
            Ready invoices can be shared straight to your accountant's email, Slack, or wherever you send files
            from your phone.
          </Text>
          <SectionTitle>Generated Invoices</SectionTitle>
        </View>
      }
      ListEmptyComponent={!doc.error ? <Text style={styles.empty}>No invoices generated yet.</Text> : null}
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
  amount: { color: colors.text, marginTop: spacing.xs, fontWeight: "700", fontSize: 16 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
  hint: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.md },
  });
}
