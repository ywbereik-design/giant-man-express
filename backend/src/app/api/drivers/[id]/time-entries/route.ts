import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  const entries = await prisma.timeEntry.findMany({
    where: { driverId: params.id },
    orderBy: { clockInAt: "desc" },
    take: 200,
  });
  return Response.json({ entries });
}
