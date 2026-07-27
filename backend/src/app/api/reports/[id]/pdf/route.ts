import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { HoursReportDocument, HoursReportEntryRow } from "@/lib/pdf/HoursReportDocument";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  const report = await prisma.hoursReport.findUnique({
    where: { id: params.id },
    include: { driver: true },
  });
  if (!report) return Response.json({ error: "Not found" }, { status: 404 });

  let entries: HoursReportEntryRow[];
  try {
    entries = JSON.parse(report.entriesJson);
  } catch {
    // entriesJson is always written by JSON.stringify in /api/reports, so
    // this isn't attacker-reachable today — but a malformed row (a future
    // migration bug, a manual DB edit) should fail cleanly, not take down
    // this route with an unhandled 500.
    return Response.json({ error: "This report's stored data is corrupted and can't be rendered" }, { status: 500 });
  }

  const buffer = await renderToBuffer(
    HoursReportDocument({
      reportNumber: report.reportNumber,
      driverName: report.driver.name,
      employeeCode: report.driver.employeeCode,
      periodStart: report.periodStart.toISOString(),
      periodEnd: report.periodEnd.toISOString(),
      generatedAt: report.generatedAt.toISOString(),
      totalHours: report.totalHours,
      totalDistanceKm: report.totalDistanceKm,
      entries,
    })
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${report.reportNumber}.pdf"`,
    },
  });
}
