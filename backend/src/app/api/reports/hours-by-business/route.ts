import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

const querySchema = z
  .object({
    businessId: z.string().min(1).optional(),
    driverId: z.string().min(1).optional(),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
  })
  .refine((data) => new Date(data.periodStart) < new Date(data.periodEnd), {
    message: "periodStart must be before periodEnd",
    path: ["periodEnd"],
  });

// Live, read-only view of hours worked per client, derived from each Job's
// own pickedUpAt -> deliveredAt window (time actively spent executing that
// job for that business), grouped by (business, driver). This is a billing
// *reference* only — it does not feed Invoice generation, which remains a
// flat rate per delivered job (see /api/invoices) and is left untouched.
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    businessId: searchParams.get("businessId") ?? undefined,
    driverId: searchParams.get("driverId") ?? undefined,
    periodStart: searchParams.get("periodStart"),
    periodEnd: searchParams.get("periodEnd"),
  });
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid query" }, { status: 400 });
  }
  const { businessId, driverId, periodStart, periodEnd } = parsed.data;
  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  const jobs = await prisma.job.findMany({
    where: {
      businessId: businessId ?? { not: null },
      ...(driverId ? { driverId } : {}),
      deliveredAt: { gte: start, lt: end },
    },
    select: {
      businessId: true,
      driverId: true,
      pickedUpAt: true,
      deliveredAt: true,
      business: { select: { name: true } },
      driver: { select: { name: true } },
    },
  });

  const groups = new Map<
    string,
    { businessId: string; businessName: string; driverId: string; driverName: string; jobCount: number; totalHours: number }
  >();

  // Jobs missing pickedUpAt/deliveredAt, or with deliveredAt before
  // pickedUpAt (possible on historical data from before jobs/[id] PATCH
  // started backfilling out-of-order stage timestamps), are excluded rather
  // than silently corrupting totalHours with a negative value —
  // skippedCount tells the caller some jobs in range weren't counted.
  let skippedCount = 0;
  for (const job of jobs) {
    if (!job.businessId || !job.business || !job.pickedUpAt || !job.deliveredAt) {
      skippedCount++;
      continue;
    }
    const hours = (job.deliveredAt.getTime() - job.pickedUpAt.getTime()) / 3600000;
    if (hours < 0) {
      skippedCount++;
      continue;
    }
    const key = `${job.businessId}:${job.driverId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.jobCount += 1;
      existing.totalHours += hours;
    } else {
      groups.set(key, {
        businessId: job.businessId,
        businessName: job.business.name,
        driverId: job.driverId,
        driverName: job.driver.name,
        jobCount: 1,
        totalHours: hours,
      });
    }
  }

  const rows = Array.from(groups.values()).sort((a, b) => a.businessName.localeCompare(b.businessName));

  return Response.json({ rows, periodStart, periodEnd, skippedCount });
}
