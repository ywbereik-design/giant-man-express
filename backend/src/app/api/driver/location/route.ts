import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActiveDriver } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { haversineDistanceKm, roundKm } from "@/lib/geo";

// A ping-to-ping segment implying a speed above this is treated as a GPS
// glitch (cold-fix jump, tunnel-exit snap, etc.) — the ping is still
// recorded, but it isn't added to the shift's cumulative distance.
const MAX_SEGMENT_KM = 2;

const schema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function POST(req: NextRequest) {
  const auth = await requireActiveDriver(req);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, schema);
  if (isError(body)) return body.error;
  const { lat, lng } = body.data;

  // Location tracking is scoped to an active shift — if the driver isn't
  // currently clocked in, there's no open TimeEntry to attribute the ping
  // (and mobile-side tracking should already be stopped at clock-out, so
  // this mainly guards against a stray/late ping from that window).
  const open = await prisma.timeEntry.findFirst({
    where: { driverId: auth.session.sub, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
  if (!open) {
    return Response.json({ error: "Not currently clocked in" }, { status: 409 });
  }

  let addedKm = 0;
  if (open.lastPingLat != null && open.lastPingLng != null) {
    const segment = haversineDistanceKm(
      { lat: open.lastPingLat, lng: open.lastPingLng },
      { lat, lng }
    );
    if (segment <= MAX_SEGMENT_KM) addedKm = segment;
  }

  const now = new Date();
  const [entry] = await prisma.$transaction([
    prisma.timeEntry.update({
      where: { id: open.id },
      data: {
        distanceKm: { increment: addedKm },
        lastPingLat: lat,
        lastPingLng: lng,
        locationPings: { create: { driverId: auth.session.sub, lat, lng, recordedAt: now } },
      },
    }),
    prisma.driver.update({
      where: { id: auth.session.sub },
      data: { currentLat: lat, currentLng: lng, currentLocationAt: now },
    }),
  ]);

  return Response.json({ distanceKm: roundKm(entry.distanceKm) });
}
