import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parsePaginationParams, buildPage } from "@/lib/pagination";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Dispatch gets read-only access here too — same reasoning as the live
  // clock-in selfie on the Drivers screen: monitoring who's on shift and
  // verifying who they are isn't a financial/account-management action.
  const auth = await requireRole(req, ["ADMIN", "DISPATCH"]);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const { cursor, limit } = parsePaginationParams(searchParams, 200, 200);

  const rows = await prisma.timeEntry.findMany({
    where: { driverId: params.id },
    orderBy: [{ clockInAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const { items, nextCursor } = buildPage(rows, limit);
  return Response.json({ entries: items, nextCursor });
}
