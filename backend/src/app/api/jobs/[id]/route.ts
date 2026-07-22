import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { JOB_STATUSES } from "@/lib/constants";
import { safeDriverSelect } from "@/lib/select";
import { runOrRespond, isResponse } from "@/lib/dbErrors";

const updateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  jobTypeId: z.string().min(1).optional(),
  driverId: z.string().min(1).optional(),
  businessId: z.string().min(1).nullable().optional(),
  pickupAddress: z.string().trim().optional(),
  dropoffAddress: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  status: z.enum(JOB_STATUSES).optional(),
});

// If an admin/dispatch sets a status directly (bypassing the driver's own
// accept/arrive/pick-up/deliver flow), keep the corresponding timestamp in
// sync — otherwise a job marked DELIVERED this way would have no
// deliveredAt and silently never show up in invoice generation, which
// filters on that field.
const TIMESTAMP_FIELD: Partial<
  Record<string, "acceptedAt" | "arrivedAt" | "pickedUpAt" | "onTheWayAt" | "deliveredAt">
> = {
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
  const { status, ...rest } = body.data;
  const timestampField = status ? TIMESTAMP_FIELD[status] : undefined;

  const result = await runOrRespond(() =>
    prisma.job.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(status ? { status } : {}),
        ...(timestampField ? { [timestampField]: new Date() } : {}),
      },
      include: { jobType: true, driver: { select: safeDriverSelect }, business: true },
    })
  );
  if (isResponse(result)) return result;

  return Response.json({ job: result });
}
