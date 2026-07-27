import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import {
  FAILURE_REASONS,
  JOB_STATUSES,
  MAX_DROPOFF_STOPS,
  MAX_JOB_NOTES_LENGTH,
  MAX_JOB_TEXT_LENGTH,
  PHONE_PATTERN,
} from "@/lib/constants";
import { safeDriverSelect } from "@/lib/select";
import { runOrRespond, isResponse } from "@/lib/dbErrors";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(MAX_JOB_TEXT_LENGTH).optional(),
  jobTypeId: z.string().min(1).optional(),
  driverId: z.string().min(1).optional(),
  businessId: z.string().min(1).nullable().optional(),
  pickupAddress: z.string().trim().max(MAX_JOB_TEXT_LENGTH).optional(),
  customerPhone: z.union([z.string().trim().regex(PHONE_PATTERN, "Enter a valid phone number"), z.literal("")]).optional(),
  // When provided, replaces the job's whole set of delivery stops — capped
  // so a single edit can't force an unbounded JobStop bulk-insert.
  dropoffAddresses: z.array(z.string().trim().min(1).max(MAX_JOB_TEXT_LENGTH)).max(MAX_DROPOFF_STOPS).optional(),
  notes: z.string().trim().max(MAX_JOB_NOTES_LENGTH).optional(),
  status: z.enum(JOB_STATUSES).optional(),
  // Required when status is being set to FAILED — see the FAILED handling below.
  failureReason: z.enum(FAILURE_REASONS).optional(),
});

// If an admin/dispatch sets a status directly (bypassing the driver's own
// accept/arrive/pick-up/deliver flow), keep the corresponding timestamp in
// sync — otherwise a job marked DELIVERED this way would have no
// deliveredAt and silently never show up in invoice generation, which
// filters on that field. Ordered so a direct jump (e.g. straight to
// DELIVERED) backfills every earlier stage's timestamp too, rather than
// leaving gaps that would make deliveredAt earlier than a later-set
// pickedUpAt — which would otherwise produce negative "hours worked"
// when reports/hours-by-business derives duration from these fields.
const STAGE_ORDER: ("ACCEPTED" | "ARRIVED" | "PICKED_UP" | "ON_THE_WAY" | "DELIVERED")[] = [
  "ACCEPTED",
  "ARRIVED",
  "PICKED_UP",
  "ON_THE_WAY",
  "DELIVERED",
];
const TIMESTAMP_FIELD: Record<string, "acceptedAt" | "arrivedAt" | "pickedUpAt" | "onTheWayAt" | "deliveredAt"> = {
  ACCEPTED: "acceptedAt",
  ARRIVED: "arrivedAt",
  PICKED_UP: "pickedUpAt",
  ON_THE_WAY: "onTheWayAt",
  DELIVERED: "deliveredAt",
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, ["ADMIN", "DISPATCH"]);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, updateSchema);
  if (isError(body)) return body.error;
  const { status, dropoffAddresses, failureReason, ...rest } = body.data;

  if (status === "FAILED" && !failureReason) {
    return Response.json({ error: "A reason is required to mark a job failed" }, { status: 400 });
  }

  const existing = await prisma.job.findUnique({ where: { id: params.id } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  // Mirror POST /api/jobs's validation — editing a job shouldn't be able to
  // silently (re)assign it to an inactive driver/job type or a nonexistent
  // business just because PATCH previously skipped these checks.
  if (rest.driverId) {
    const driver = await prisma.driver.findUnique({ where: { id: rest.driverId } });
    if (!driver || !driver.active) {
      return Response.json({ error: "Select a valid, active driver" }, { status: 400 });
    }
  }
  if (rest.jobTypeId) {
    const jobType = await prisma.jobType.findUnique({ where: { id: rest.jobTypeId } });
    if (!jobType || !jobType.active) {
      return Response.json({ error: "Select a valid, active job type" }, { status: 400 });
    }
  }
  if (rest.businessId) {
    const business = await prisma.business.findUnique({ where: { id: rest.businessId } });
    if (!business) {
      return Response.json({ error: "Selected business does not exist" }, { status: 400 });
    }
  }

  const timestampUpdates: Partial<Record<"acceptedAt" | "arrivedAt" | "pickedUpAt" | "onTheWayAt" | "deliveredAt", Date>> =
    {};
  if (status) {
    const now = new Date();
    const targetIndex = STAGE_ORDER.indexOf(status as (typeof STAGE_ORDER)[number]);
    for (let i = 0; i <= targetIndex; i++) {
      const field = TIMESTAMP_FIELD[STAGE_ORDER[i]];
      if (!existing[field]) timestampUpdates[field] = now;
    }
  }

  const result = await runOrRespond(() =>
    prisma.job.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(status ? { status } : {}),
        ...timestampUpdates,
        ...(status === "FAILED" ? { failedAt: new Date(), failureReason } : {}),
        ...(dropoffAddresses !== undefined
          ? {
              dropoffStops: {
                deleteMany: {},
                create: dropoffAddresses.map((address, sequence) => ({ address, sequence })),
              },
            }
          : {}),
      },
      include: {
        jobType: true,
        driver: { select: safeDriverSelect },
        business: true,
        dropoffStops: { orderBy: { sequence: "asc" } },
      },
    })
  );
  if (isResponse(result)) return result;

  return Response.json({ job: result });
}
