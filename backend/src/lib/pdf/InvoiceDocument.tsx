import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { COMPANY_NAME, COMPANY_LOCATION, styles, formatDate, formatCurrency } from "./shared";

export interface InvoiceLineItemRow {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface InvoicePdfProps {
  invoiceNumber: string;
  businessName: string;
  businessAddress: string | null;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  totalAmount: number;
  lineItems: InvoiceLineItemRow[];
}

export function InvoiceDocument(props: InvoicePdfProps) {
  const {
    invoiceNumber,
    businessName,
    businessAddress,
    periodStart,
    periodEnd,
    generatedAt,
    totalAmount,
    lineItems,
  } = props;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{COMPANY_NAME}</Text>
            <Text style={styles.companySub}>{COMPANY_LOCATION}</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Invoice</Text>
            <Text style={styles.docNumber}>{invoiceNumber}</Text>
          </View>
        </View>

        <View style={styles.metaBlock}>
          <View>
            <Text style={styles.metaLabel}>Bill To</Text>
            <Text style={styles.metaValue}>{businessName}</Text>
            {businessAddress ? <Text style={styles.companySub}>{businessAddress}</Text> : null}
          </View>
          <View>
            <Text style={styles.metaLabel}>Billing Period</Text>
            <Text style={styles.metaValue}>{formatDate(periodStart)} – {formatDate(periodEnd)}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Invoice Date</Text>
            <Text style={styles.metaValue}>{formatDate(generatedAt)}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={{ ...styles.tableHeaderCell, width: "46%" }}>Description</Text>
            <Text style={{ ...styles.tableHeaderCell, width: "14%", textAlign: "right" }}>Qty</Text>
            <Text style={{ ...styles.tableHeaderCell, width: "20%", textAlign: "right" }}>Rate</Text>
            <Text style={{ ...styles.tableHeaderCell, width: "20%", textAlign: "right" }}>Amount</Text>
          </View>
          {lineItems.map((item, i) => (
            <View style={styles.tableRow} key={i}>
              <Text style={{ width: "46%" }}>{item.description}</Text>
              <Text style={{ width: "14%", textAlign: "right" }}>{item.quantity}</Text>
              <Text style={{ width: "20%", textAlign: "right" }}>{formatCurrency(item.rate)}</Text>
              <Text style={{ width: "20%", textAlign: "right" }}>{formatCurrency(item.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>Total Due</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(totalAmount)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>{COMPANY_NAME} — Invoice {invoiceNumber}</Text>
      </Page>
    </Document>
  );
}
