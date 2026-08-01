import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { JOB_STATUSES, MAX_DROPOFF_STOPS, MAX_JOB_NOTES_LENGTH, MAX_JOB_TEXT_LENGTH, PHONE_PATTERN } from "@/lib/constants";
import { safeDriverSelect } from "@/lib/select";
import { runOrRespond, isResponse } from "@/lib/dbErrors";

const JOB_INCLUDE = {
  jobType: true,
  driver: { select: safeDriverSelect },
  business: true,
  dropoffStops: { orderBy: { sequence: "asc" as const } },
};

export async function GET(req: NextRequest) {
  // Dispatch and admin both need full visibility into jobs — dispatching
  // and tracking jobs is dispatch's core function.
  const auth = await requireRole(req, ["ADMIN", "DISPATCH"]);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const driverId = searchParams.get("driverId");

  const jobs = await prisma.job.findMany({
    where: {
      ...(status && (JOB_STATUSES as readonly string[]).includes(status) ? { status } : {}),
      ...(driverId ? { driverId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: JOB_INCLUDE,
    // Bounded so this list doesn't grow unboundedly (with full photo data
    // URLs on every row) as the business accumulates job history — the admin
    // UI's default "Active" filter only needs recent/in-flight jobs anyway.
    take: 200,
  });
  return Response.json({ jobs });
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(MAX_JOB_TEXT_LENGTH),
  jobTypeId: z.string().min(1),
  driverId: z.string().min(1),
  businessId: z.string().min(1).optional(),
  pickupAddress: z.string().trim().max(MAX_JOB_TEXT_LENGTH).optional(),
  clientPhone: z.union([z.string().trim().regex(PHONE_PATTERN, "Enter a valid phone number"), z.literal("")]).optional(),
  // One pickup, any number of delivery stops, in route order — capped so a
  // single job can't force an unbounded JobStop bulk-insert.
  dropoffAddresses: z.array(z.string().trim().min(1).max(MAX_JOB_TEXT_LENGTH)).max(MAX_DROPOFF_STOPS).optional(),
  notes: z.string().trim().max(MAX_JOB_NOTES_LENGTH).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["ADMIN", "DISPATCH"]);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, createSchema);
  if (isError(body)) return body.error;
  const { jobTypeId, driverId, businessId, dropoffAddresses, ...jobData } = body.data;

  const [jobType, driver, business] = await Promise.all([
    prisma.jobType.findUnique({ where: { id: jobTypeId } }),
    prisma.driver.findUnique({ where: { id: driverId } }),
    businessId ? prisma.business.findUnique({ where: { id: businessId } }) : Promise.resolve(null),
  ]);

  if (!jobType || !jobType.active) {
    return Response.json({ error: "Select a valid, active job type" }, { status: 400 });
  }
  if (!driver || !driver.active) {
    return Response.json({ error: "Select a valid, active driver" }, { status: 400 });
  }
  if (businessId && !business) {
    return Response.json({ error: "Selected business does not exist" }, { status: 400 });
  }

  const result = await runOrRespond(() =>
    prisma.job.create({
      data: {
        ...jobData,
        jobTypeId,
        driverId,
        businessId,
        status: JOB_STATUSES[0],
        ...(dropoffAddresses?.length
          ? { dropoffStops: { create: dropoffAddresses.map((address, sequence) => ({ address, sequence })) } }
          : {}),
      },
      include: JOB_INCLUDE,
    })
  );
  if (isResponse(result)) return result;

  return Response.json({ job: result }, { status: 201 });
}
