import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveDriver } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireActiveDriver(req);
  if ("error" in auth) return auth.error;

  const entries = await prisma.timeEntry.findMany({
    where: { driverId: auth.session.sub },
    orderBy: { clockInAt: "desc" },
    take: 100,
  });
  return Response.json({ entries });
}
