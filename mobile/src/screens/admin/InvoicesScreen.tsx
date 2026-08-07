import React, { useCallback, useMemo } from "react";
import { FlatList, Text, View, StyleSheet } from "react-native";
import { api } from "../../api/client";
import { Business, Invoice } from "../../api/types";
import { Button, Card, CenteredSpinner, ErrorText, Label, SectionTitle } from "../../components/ui";
import { ChipSelect } from "../../components/ChipSelect";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { formatRange, formatDate } from "../../lib/dateRange";
import { useGeneratedDocument } from "../../lib/useGeneratedDocument";

export function InvoicesScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const loadPickerOptions = useCallback(async () => {
    const res = await api.get<{ businesses: Business[] }>("/api/businesses");
    return res.businesses.map((b) => ({ id: b.id, label: b.name }));
  }, []);
  const loadItems = useCallback(async (cursor?: string) => {
    const res = await api.get<{ invoices: Invoice[]; nextCursor: string | null }>(
      `/api/invoices${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
    );
    return { items: res.invoices, nextCursor: res.nextCursor };
  }, []);
  const generateDocument = useCallback(
    (businessId: string, range: { start: Date; end: Date }) =>
      api.post("/api/invoices", { businessId, periodStart: range.start.toISOString(), periodEnd: range.end.toISOString() }),
    []
  );

  const doc = useGeneratedDocument<Invoice>({
    loadPickerOptions,
    loadItems,
    getItemId: (i) => i.id,
    generateDocument,
    pdfPath: (i) => `/api/invoices/${i.id}/pdf`,
    pdfFilename: (i) => `${i.invoiceNumber}.pdf`,
    pickerMissingMessage: "Choose a business",
    loadErrorFallback: "Could not load invoices",
    generateErrorFallback: "Could not generate invoice",
  });

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
      renderItem={({ item }) => (
        <Card>
          <Text style={styles.number}>{item.invoiceNumber}</Text>
          <Text style={styles.meta}>{item.business?.name}</Text>
          <Text style={styles.meta}>
            {formatDate(item.periodStart)} – {formatDate(item.periodEnd)}
          </Text>
          <Text style={styles.amount}>${item.totalAmount.toFixed(2)}</Text>
          <View style={{ marginTop: spacing.sm }}>
            <Button title="Share / Save PDF" variant="secondary" onPress={() => doc.share(item)} loading={doc.sharingId === item.id} />
          </View>
        </Card>
      )}
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
