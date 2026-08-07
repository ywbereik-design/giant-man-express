import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { nextNumber } from "@/lib/numbering";
import { runOrRespond, isResponse } from "@/lib/dbErrors";
import { parsePaginationParams, buildPage } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["ADMIN", "ACCOUNTANT"]);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const driverId = searchParams.get("driverId");
  const { cursor, limit } = parsePaginationParams(searchParams, 100, 100);

  const rows = await prisma.hoursReport.findMany({
    where: driverId ? { driverId } : {},
    orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
    include: { driver: { select: { name: true, employeeCode: true } } },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const { items, nextCursor } = buildPage(rows, limit);
  return Response.json({ reports: items, nextCursor });
}

const createSchema = z
  .object({
    driverId: z.string().min(1),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
  })
  .refine((data) => new Date(data.periodStart) < new Date(data.periodEnd), {
    message: "periodStart must be before periodEnd",
    path: ["periodEnd"],
  });

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["ADMIN", "ACCOUNTANT"]);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, createSchema);
  if (isError(body)) return body.error;
  const { driverId, periodStart, periodEnd } = body.data;

  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) return Response.json({ error: "Driver not found" }, { status: 404 });

  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  // Guard against accidentally generating the exact same report twice
  // (e.g. a double tap), which would double-count those hours for payroll.
  const duplicate = await prisma.hoursReport.findFirst({
    where: { driverId, periodStart: start, periodEnd: end },
  });
  if (duplicate) {
    return Response.json(
      { error: `A report (${duplicate.reportNumber}) already exists for this driver and period` },
      { status: 409 }
    );
  }

  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      driverId,
      clockInAt: { gte: start, lt: end },
      clockOutAt: { not: null },
    },
    orderBy: { clockInAt: "asc" },
  });

  const rows = timeEntries.map((e) => ({
    clockInAt: e.clockInAt.toISOString(),
    clockOutAt: e.clockOutAt!.toISOString(),
    hours: (e.clockOutAt!.getTime() - e.clockInAt.getTime()) / 3600000,
    distanceKm: e.distanceKm,
  }));
  const totalHours = rows.reduce((sum, r) => sum + r.hours, 0);
  const totalDistanceKm = rows.reduce((sum, r) => sum + r.distanceKm, 0);

  // The findFirst check above handles the common sequential-duplicate case
  // with a friendly message; the @@unique([driverId, periodStart, periodEnd])
  // constraint is the backstop for two concurrent requests both passing that
  // check before either commits (e.g. a double-tap) — runOrRespond turns the
  // resulting P2002 into a clean 409 instead of an unhandled 500. The number
  // increment and the row insert share one transaction so a collision rolls
  // both back together instead of burning a report number on a request that
  // never produced a report.
  const result = await runOrRespond(() =>
    prisma.$transaction(async (tx) => {
      const reportNumber = await nextNumber("HR", "hours_report", tx);
      return tx.hoursReport.create({
        data: {
          reportNumber,
          driverId,
          periodStart: start,
          periodEnd: end,
          totalHours,
          totalDistanceKm,
          entriesJson: JSON.stringify(rows),
        },
        include: { driver: { select: { name: true, employeeCode: true } } },
      });
    })
  );
  if (isResponse(result)) return result;

  return Response.json({ report: result }, { status: 201 });
}
