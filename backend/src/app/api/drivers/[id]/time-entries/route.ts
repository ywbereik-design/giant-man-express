import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Dispatch gets read-only access here too — same reasoning as the live
  // clock-in selfie on the Drivers screen: monitoring who's on shift and
  // verifying who they are isn't a financial/account-management action.
  const auth = await requireRole(req, ["ADMIN", "DISPATCH"]);
  if ("error" in auth) return auth.error;

  const entries = await prisma.timeEntry.findMany({
    where: { driverId: params.id },
    orderBy: { clockInAt: "desc" },
    take: 200,
  });
  return Response.json({ entries });
}
