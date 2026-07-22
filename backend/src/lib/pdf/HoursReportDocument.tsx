import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { COMPANY_NAME, COMPANY_LOCATION, styles, formatDate, formatHours } from "./shared";

export interface HoursReportEntryRow {
  clockInAt: string;
  clockOutAt: string | null;
  hours: number;
}

export interface HoursReportPdfProps {
  reportNumber: string;
  driverName: string;
  employeeCode: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  totalHours: number;
  entries: HoursReportEntryRow[];
}

export function HoursReportDocument(props: HoursReportPdfProps) {
  const { reportNumber, driverName, employeeCode, periodStart, periodEnd, generatedAt, totalHours, entries } = props;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{COMPANY_NAME}</Text>
            <Text style={styles.companySub}>{COMPANY_LOCATION}</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Hours Report</Text>
            <Text style={styles.docNumber}>{reportNumber}</Text>
          </View>
        </View>

        <View style={styles.metaBlock}>
          <View>
            <Text style={styles.metaLabel}>Driver</Text>
            <Text style={styles.metaValue}>{driverName} ({employeeCode})</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Pay Period</Text>
            <Text style={styles.metaValue}>{formatDate(periodStart)} – {formatDate(periodEnd)}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Generated</Text>
            <Text style={styles.metaValue}>{formatDate(generatedAt)}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={{ ...styles.tableHeaderCell, width: "20%" }}>Date</Text>
            <Text style={{ ...styles.tableHeaderCell, width: "25%" }}>Clock In</Text>
            <Text style={{ ...styles.tableHeaderCell, width: "25%" }}>Clock Out</Text>
            <Text style={{ ...styles.tableHeaderCell, width: "30%", textAlign: "right" }}>Hours</Text>
          </View>
          {entries.map((e, i) => (
            <View style={styles.tableRow} key={i}>
              <Text style={{ width: "20%" }}>{formatDate(e.clockInAt)}</Text>
              <Text style={{ width: "25%" }}>{new Date(e.clockInAt).toLocaleTimeString("en-CA")}</Text>
              <Text style={{ width: "25%" }}>
                {e.clockOutAt ? new Date(e.clockOutAt).toLocaleTimeString("en-CA") : "—"}
              </Text>
              <Text style={{ width: "30%", textAlign: "right" }}>{formatHours(e.hours)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>Total Hours</Text>
            <Text style={styles.grandTotalValue}>{formatHours(totalHours)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>{COMPANY_NAME} — Report {reportNumber}</Text>
      </Page>
    </Document>
  );
}
