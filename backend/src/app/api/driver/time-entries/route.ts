import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveDriver } from "@/lib/auth";
import { parsePaginationParams, buildPage } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  const auth = await requireActiveDriver(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const { cursor, limit } = parsePaginationParams(searchParams, 100, 100);

  const rows = await prisma.timeEntry.findMany({
    where: { driverId: auth.session.sub },
    orderBy: [{ clockInAt: "desc" }, { id: "desc" }],
    // The driver's own shift-history screen never displays clockInPhoto —
    // excluding it here avoids pulling up to 100 full selfie images (up to
    // 3MB each) into one response for a list that only shows times/hours/km.
    select: { id: true, clockInAt: true, clockInLat: true, clockInLng: true, clockOutAt: true, clockOutLat: true, clockOutLng: true, distanceKm: true },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const { items, nextCursor } = buildPage(rows, limit);
  return Response.json({ entries: items, nextCursor });
}
