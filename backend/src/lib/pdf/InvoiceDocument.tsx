import React from "react";
import path from "path";
import fs from "fs";
import { Document, Page, Text, View, Image, Svg, Path, Defs, LinearGradient, Stop } from "@react-pdf/renderer";
import { formatDate, formatCurrency } from "./shared";

// Matches the company's real printed letterhead (angled black/gray banner,
// logo, footer contact bar) rather than the generic invoice look this
// replaced — see the reference this was built from for the exact layout.
// react-pdf's Image needs either a real URL or a data URI for a local file
// on the server — a bare filesystem path fails with "Only absolute URLs
// are supported", so this reads it once at module load and embeds it
// as base64.
const LOGO_DATA_URI = `data:image/png;base64,${fs
  .readFileSync(path.join(__dirname, "assets", "logo.png"))
  .toString("base64")}`;

const COMPANY = {
  name: "GiantMan Express & Delivery Inc",
  tagline: "your success is our business",
  addressLine1: "124 Sencha Terr",
  addressLine2: "Ottawa, ON, K2J 6Z2",
  phone: "(819)-329-9398",
  email: "hussamkissa.1978@gmail.com",
  footerPhone: "(819) 329-9398",
  footerEmail: "sales@giantman-logistics.ca",
  footerWebsite: "http://giantman-logistics.ca",
  footerAddress: "124 Sencha Ter, Nepean, ON K2J 6Z2, CANADA",
  taxNumber: "786787135RT0001",
};

// Standard net-30 terms — the source invoice this design is modeled on
// used exactly this (period end -> due date, 30 days later), and there's
// no separate due-date field on Invoice to read from.
const DUE_DAYS = 30;
function dueDate(periodEnd: string): string {
  const d = new Date(periodEnd);
  d.setDate(d.getDate() + DUE_DAYS);
  return formatDate(d);
}

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

const BLACK = "#000000";
const BANNER_HEIGHT = 120;

// Exact boundary traced pixel-by-pixel from the company's real letterhead
// PDF (a thin full-width black strip, widening into a black region on the
// left that curves down to meet the left edge, with a gold band running
// just outside that same curve) — not hand-drawn shapes, so this matches
// the source design precisely instead of approximating it.
const HEADER_BLACK_PATH =
  "M611.3,0 L611.3,0 L611.3,3 L611.3,6 L611.3,9 L611.3,12 L611.3,15 L611.3,18 L388.7,21 L363.3,24 L338,27 L318,30 L298,33 L281.3,36 L263.3,39 L248.7,42 L232.7,45 L219.3,48 L204.7,51 L192.7,54 L178.7,57 L167.3,60 L154.7,63 L143.3,66 L132,69 L121.3,72 L110,75 L100,78 L89.3,81 L80,84 L69.3,87 L59.3,90 L50.7,93 L41.3,96 L32.7,99 L23.3,102 L16,105 L6.7,108 L0,111 L0,0 Z";
const HEADER_GOLD_PATH =
  "M611.3,0 L611.3,3 L611.3,6 L611.3,9 L611.3,12 L611.3,15 L611.3,18 L392,21 L366,24 L340.7,27 L320.7,30 L300.7,33 L326,36 L310.7,39 L298,42 L284,45 L271.3,48 L258.7,51 L248,54 L235.3,57 L224.7,60 L213.3,63 L203.3,66 L193.3,69 L184,72 L173.3,75 L164,78 L154.7,81 L146,84 L136,87 L127.3,90 L119.3,93 L110.7,96 L102.7,99 L94,102 L86.7,105 L78,108 L70.7,111 L62.7,114 L0,111 L6.7,108 L16,105 L23.3,102 L32.7,99 L41.3,96 L50.7,93 L59.3,90 L69.3,87 L80,84 L89.3,81 L100,78 L110,75 L121.3,72 L132,69 L143.3,66 L154.7,63 L167.3,60 L178.7,57 L192.7,54 L204.7,51 L219.3,48 L232.7,45 L248.7,42 L263.3,39 L281.3,36 L298,33 L318,30 L338,27 L363.3,24 L388.7,21 L611.3,18 L611.3,15 L611.3,12 L611.3,9 L611.3,6 L611.3,3 L611.3,0 Z";
// Footer is the exact same traced shapes, flipped vertically (black
// anchored to the bottom edge, gold sweeping up from it) — the real
// letterhead's footer is this same curve upside down.
const FOOTER_BLACK_PATH =
  "M611.3,120.0 L611.3,120.0 L611.3,117.0 L611.3,114.0 L611.3,111.0 L611.3,108.0 L611.3,105.0 L611.3,102.0 L388.7,99.0 L363.3,96.0 L338,93.0 L318,90.0 L298,87.0 L281.3,84.0 L263.3,81.0 L248.7,78.0 L232.7,75.0 L219.3,72.0 L204.7,69.0 L192.7,66.0 L178.7,63.0 L167.3,60.0 L154.7,57.0 L143.3,54.0 L132,51.0 L121.3,48.0 L110,45.0 L100,42.0 L89.3,39.0 L80,36.0 L69.3,33.0 L59.3,30.0 L50.7,27.0 L41.3,24.0 L32.7,21.0 L23.3,18.0 L16,15.0 L6.7,12.0 L0,9.0 L0,120.0 Z";
const FOOTER_GOLD_PATH =
  "M611.3,120.0 L611.3,117.0 L611.3,114.0 L611.3,111.0 L611.3,108.0 L611.3,105.0 L611.3,102.0 L392,99.0 L366,96.0 L340.7,93.0 L320.7,90.0 L300.7,87.0 L326,84.0 L310.7,81.0 L298,78.0 L284,75.0 L271.3,72.0 L258.7,69.0 L248,66.0 L235.3,63.0 L224.7,60.0 L213.3,57.0 L203.3,54.0 L193.3,51.0 L184,48.0 L173.3,45.0 L164,42.0 L154.7,39.0 L146,36.0 L136,33.0 L127.3,30.0 L119.3,27.0 L110.7,24.0 L102.7,21.0 L94,18.0 L86.7,15.0 L78,12.0 L70.7,9.0 L62.7,6.0 L0,9.0 L6.7,12.0 L16,15.0 L23.3,18.0 L32.7,21.0 L41.3,24.0 L50.7,27.0 L59.3,30.0 L69.3,33.0 L80,36.0 L89.3,39.0 L100,42.0 L110,45.0 L121.3,48.0 L132,51.0 L143.3,54.0 L154.7,57.0 L167.3,60.0 L178.7,63.0 L192.7,66.0 L204.7,69.0 L219.3,72.0 L232.7,75.0 L248.7,78.0 L263.3,81.0 L281.3,84.0 L298,87.0 L318,90.0 L338,93.0 L363.3,96.0 L388.7,99.0 L611.3,102.0 L611.3,105.0 L611.3,108.0 L611.3,111.0 L611.3,114.0 L611.3,117.0 L611.3,120.0 Z";

function LetterheadBanner({ variant }: { variant: "header" | "footer" }) {
  const gradientId = variant === "header" ? "goldHeader" : "goldFooter";
  // Colors sampled directly from the reference PDF's gold band (darker
  // amber near its inner edge, brightening toward its outer edge).
  const gold = (
    <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopColor="#a8681f" />
      <Stop offset="0.5" stopColor="#d99a2f" />
      <Stop offset="1" stopColor="#f5c04a" />
    </LinearGradient>
  );
  const blackPath = variant === "header" ? HEADER_BLACK_PATH : FOOTER_BLACK_PATH;
  const goldPath = variant === "header" ? HEADER_GOLD_PATH : FOOTER_GOLD_PATH;

  return (
    <Svg width={612} height={BANNER_HEIGHT} viewBox={`0 0 612 ${BANNER_HEIGHT}`} style={s.bannerSvg}>
      <Defs>{gold}</Defs>
      <Path d={goldPath} fill={`url(#${gradientId})`} />
      <Path d={blackPath} fill={BLACK} />
    </Svg>
  );
}

export function InvoiceDocument(props: InvoicePdfProps) {
  const {
    invoiceNumber,
    businessName,
    businessAddress,
    periodEnd,
    generatedAt,
    totalAmount,
    lineItems,
  } = props;

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <View style={s.headerWrap}>
          <LetterheadBanner variant="header" />
          <Text style={s.tagline}>{COMPANY.tagline}</Text>
          <Image src={LOGO_DATA_URI} style={s.logo} />
        </View>
        <Text style={s.invoiceTitle}>INVOICE</Text>

        <View style={s.metaRow}>
          <View style={s.fromBlock}>
            <Text style={s.addressLine}>{COMPANY.addressLine1}</Text>
            <Text style={s.addressLine}>{COMPANY.addressLine2}</Text>
            <Text style={s.addressLine}>Phone: {COMPANY.phone}</Text>
            <Text style={s.addressLine}>E-mail: {COMPANY.email}</Text>
          </View>
          <View style={s.metaBlock}>
            <View style={s.metaGrid}>
              <Text style={s.metaKey}>Date:</Text>
              <Text style={s.metaVal}>{formatDate(generatedAt)}</Text>
              <Text style={s.metaKey}>Invoice #:</Text>
              <Text style={s.metaVal}>{invoiceNumber}</Text>
              <Text style={s.metaKey}>For:</Text>
              <Text style={s.metaVal}>Delivery Service</Text>
              <Text style={s.metaKey}>Bill To:</Text>
              <Text style={s.metaVal}>{businessName}</Text>
            </View>
            {businessAddress ? <Text style={s.billToAddress}>{businessAddress}</Text> : null}
          </View>
        </View>

        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={s.tableHeaderDesc}>DESCRIPTION</Text>
            <Text style={s.tableHeaderAmount}>AMOUNT</Text>
          </View>
          {lineItems.map((item, i) => (
            <View style={s.tableRow} key={i}>
              <Text style={s.tableDesc}>{item.description}</Text>
              <Text style={s.tableAmount}>{formatCurrency(item.amount)}</Text>
            </View>
          ))}
        </View>

        <Text style={s.dueNote}>Last payment due date is {dueDate(periodEnd)}</Text>

        <View style={s.bottomRow}>
          <View style={s.bottomLeft}>
            <Text style={s.taxNumber}>TAX Number: {COMPANY.taxNumber}</Text>
            <Text style={s.thankYou}>THANK YOU FOR YOUR BUSINESS!</Text>
          </View>
          <View style={s.totalsBlock}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>SUBTOTAL</Text>
              <Text style={s.totalValue}>{formatCurrency(totalAmount)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>TAX RATE</Text>
              <Text style={s.totalValue}>0.00%</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>SALES TAX</Text>
              <Text style={s.totalValue}>{formatCurrency(0)}</Text>
            </View>
            <View style={[s.totalRow, s.grandTotalRow]}>
              <Text style={s.grandTotalLabel}>TOTAL</Text>
              <Text style={s.grandTotalValue}>{formatCurrency(totalAmount)}</Text>
            </View>
          </View>
        </View>

        <View style={s.footerWrap} fixed>
          <LetterheadBanner variant="footer" />
          <Text style={s.footerLine}>
            {COMPANY.footerPhone}   •   {COMPANY.footerEmail}   •   {COMPANY.footerWebsite}
          </Text>
          <Text style={s.footerLine2}>{COMPANY.footerAddress}</Text>
        </View>
      </Page>
    </Document>
  );
}

const s = {
  page: { fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a", paddingBottom: 128 },
  bannerSvg: { position: "absolute" as const, top: 0, left: 0 },
  headerWrap: { position: "relative" as const, height: 120, marginBottom: 10 },
  tagline: {
    position: "absolute" as const,
    top: 6,
    left: 130,
    color: "#ffffff",
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  logo: { position: "absolute" as const, top: 4, left: 16, width: 105 },
  invoiceTitle: {
    textAlign: "right" as const,
    marginHorizontal: 36,
    marginTop: 8,
    marginBottom: 16,
    fontSize: 26,
    fontFamily: "Times-Bold",
    color: "#1a1a1a",
  },
  metaRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, paddingHorizontal: 36, marginBottom: 18 },
  fromBlock: { width: "45%" },
  addressLine: { fontSize: 9.5, color: "#333", marginTop: 2 },
  metaBlock: { width: "50%" },
  metaGrid: { flexDirection: "row" as const, flexWrap: "wrap" as const },
  metaKey: { width: "30%", fontSize: 9.5, color: "#333", marginTop: 2 },
  metaVal: { width: "70%", fontSize: 9.5, color: "#1a1a1a", marginTop: 2 },
  billToAddress: { fontSize: 9.5, color: "#1a1a1a", marginTop: 2, marginLeft: "30%" },
  table: { marginHorizontal: 36, borderTop: "1.5 solid #1a1a1a" },
  tableHeaderRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    borderBottom: "1 solid #1a1a1a",
    paddingVertical: 6,
  },
  tableHeaderDesc: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  tableHeaderAmount: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  tableRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    borderBottom: "0.5 solid #bbb",
    paddingVertical: 8,
  },
  tableDesc: { width: "78%", fontSize: 9.5 },
  tableAmount: { width: "20%", fontSize: 9.5, textAlign: "right" as const },
  dueNote: { marginHorizontal: 36, marginTop: 20, marginBottom: 16, fontSize: 10, fontFamily: "Helvetica-Bold" },
  bottomRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, paddingHorizontal: 36 },
  bottomLeft: { width: "45%", justifyContent: "flex-end" as const },
  taxNumber: { fontSize: 9.5, marginBottom: 8 },
  thankYou: { fontSize: 10, fontFamily: "Helvetica-BoldOblique" },
  totalsBlock: { width: "42%" },
  totalRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    borderBottom: "0.5 solid #ccc",
    paddingVertical: 5,
  },
  totalLabel: { fontSize: 9.5, color: "#333" },
  totalValue: { fontSize: 9.5, color: "#1a1a1a" },
  grandTotalRow: { borderBottomWidth: 0, marginTop: 2 },
  grandTotalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  grandTotalValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  footerWrap: { position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 120 },
  footerLine: {
    position: "absolute" as const,
    top: 103,
    left: 0,
    right: 0,
    textAlign: "center" as const,
    color: "#ffffff",
    fontSize: 8.5,
  },
  footerLine2: {
    position: "absolute" as const,
    top: 112,
    left: 0,
    right: 0,
    textAlign: "center" as const,
    color: "#ffffff",
    fontSize: 8.5,
  },
};
