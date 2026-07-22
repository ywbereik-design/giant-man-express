import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { roundKm, startOfTodayUTC } from "@/lib/geo";

// Live position + today's route/mileage for one driver, for the admin/
// dispatch dashboard. "Today" covers every shift that overlaps the current
// UTC day, so a still-open overnight shift is included.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, ["ADMIN", "DISPATCH"]);
  if ("error" in auth) return auth.error;

  const driver = await prisma.driver.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, currentLat: true, currentLng: true, currentLocationAt: true },
  });
  if (!driver) return Response.json({ error: "Not found" }, { status: 404 });

  const dayStart = startOfTodayUTC();
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const shifts = await prisma.timeEntry.findMany({
    where: {
      driverId: params.id,
      clockInAt: { lt: dayEnd },
      OR: [{ clockOutAt: null }, { clockOutAt: { gte: dayStart } }],
    },
    orderBy: { clockInAt: "asc" },
    select: { id: true, clockInAt: true, clockOutAt: true, distanceKm: true },
  });

  const route = shifts.length
    ? await prisma.locationPing.findMany({
        where: { timeEntryId: { in: shifts.map((s) => s.id) } },
        orderBy: { recordedAt: "asc" },
        select: { lat: true, lng: true, recordedAt: true },
      })
    : [];

  const todayDistanceKm = shifts.reduce((sum, s) => sum + s.distanceKm, 0);

  return Response.json({
    driver: { id: driver.id, name: driver.name },
    current:
      driver.currentLat != null && driver.currentLng != null
        ? { lat: driver.currentLat, lng: driver.currentLng, at: driver.currentLocationAt }
        : null,
    today: { distanceKm: roundKm(todayDistanceKm), shifts },
    route,
  });
}
