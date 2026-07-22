import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveDriver } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireActiveDriver(req);
  if ("error" in auth) return auth.error;

  const open = await prisma.timeEntry.findFirst({
    where: { driverId: auth.session.sub, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
  return Response.json({ clockedIn: !!open, openEntry: open ?? null });
}
