import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { startOfTodayUTC } from "@/lib/geo";

// Active drivers who haven't clocked in yet today (UTC day), for the admin
// "not clocked in" alert. Always "as of right now" — no time-of-day cutoff,
// so an admin checking at 6am will naturally see everyone until shifts start.
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["ADMIN", "DISPATCH"]);
  if ("error" in auth) return auth.error;

  const dayStart = startOfTodayUTC();

  const [drivers, clockedInToday] = await Promise.all([
    prisma.driver.findMany({
      where: { active: true },
      select: { id: true, name: true, employeeCode: true },
      orderBy: { name: "asc" },
    }),
    prisma.timeEntry.findMany({
      where: { clockInAt: { gte: dayStart } },
      select: { driverId: true },
      distinct: ["driverId"],
    }),
  ]);

  const clockedInIds = new Set(clockedInToday.map((e) => e.driverId));
  const notClockedIn = drivers.filter((d) => !clockedInIds.has(d.id));

  return Response.json({ drivers: notClockedIn, asOf: new Date().toISOString() });
}
