import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveDriver } from "@/lib/auth";
import { JOB_STATUSES } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const auth = await requireActiveDriver(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const jobs = await prisma.job.findMany({
    where: {
      driverId: auth.session.sub,
      ...(status && (JOB_STATUSES as readonly string[]).includes(status)
        ? { status }
        : { status: { notIn: ["CANCELLED", "DELIVERED", "FAILED"] } }),
    },
    orderBy: { createdAt: "desc" },
    include: { jobType: true, business: true, dropoffStops: { orderBy: { sequence: "asc" } } },
  });
  return Response.json({ jobs });
}
