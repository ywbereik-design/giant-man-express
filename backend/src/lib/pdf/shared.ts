import { StyleSheet } from "@react-pdf/renderer";

export const COMPANY_NAME = "Giant Man Express & Delivery";
export const COMPANY_LOCATION = "Ottawa, Ontario";

export const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 11, fontFamily: "Helvetica", color: "#1a1a1a" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  companyName: { fontSize: 16, fontWeight: 700 },
  companySub: { fontSize: 10, color: "#555" },
  docTitle: { fontSize: 18, fontWeight: 700, textAlign: "right" },
  docNumber: { fontSize: 11, textAlign: "right", color: "#555" },
  metaBlock: { marginBottom: 20, flexDirection: "row", justifyContent: "space-between" },
  metaLabel: { fontSize: 9, color: "#777", textTransform: "uppercase" },
  metaValue: { fontSize: 12, marginTop: 2 },
  table: { marginTop: 12, borderTop: "1 solid #ddd" },
  tableRow: { flexDirection: "row", borderBottom: "1 solid #eee", paddingVertical: 6 },
  tableHeaderRow: { flexDirection: "row", borderBottom: "1 solid #ddd", paddingVertical: 6 },
  tableHeaderCell: { fontSize: 9, color: "#777", textTransform: "uppercase" },
  totalsBlock: { marginTop: 16, alignItems: "flex-end" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", width: 200 },
  totalLabel: { fontSize: 11 },
  totalValue: { fontSize: 11 },
  grandTotalLabel: { fontSize: 13, fontWeight: 700 },
  grandTotalValue: { fontSize: 13, fontWeight: 700 },
  footer: { marginTop: 32, fontSize: 9, color: "#999" },
});

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

export function formatCurrency(n: number): string {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

export function formatHours(n: number): string {
  return `${n.toFixed(2)} hrs`;
}
