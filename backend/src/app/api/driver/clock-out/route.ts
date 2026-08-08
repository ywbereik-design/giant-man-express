import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActiveDriver } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";

const schema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireActiveDriver(req);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, schema);
  if (isError(body)) return body.error;

  const open = await prisma.timeEntry.findFirst({
    where: { driverId: auth.session.sub, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
  if (!open) {
    return Response.json({ error: "Not currently clocked in" }, { status: 409 });
  }

  // Without the clockOutAt: null guard, a double-tap (or the offline-queue
  // flush racing a manual retry) could both read the same open entry and
  // both update it — the second write would silently overwrite the first
  // clock-out's lat/lng with its own, and both requests would report success
  // even though only one clock-out actually happened.
  const result = await prisma.timeEntry.updateMany({
    where: { id: open.id, clockOutAt: null },
    data: { clockOutAt: new Date(), clockOutLat: body.data.lat, clockOutLng: body.data.lng },
  });
  if (result.count === 0) {
    return Response.json({ error: "Already clocked out — please retry." }, { status: 409 });
  }

  const entry = await prisma.timeEntry.findUnique({ where: { id: open.id } });
  return Response.json({ entry });
}
