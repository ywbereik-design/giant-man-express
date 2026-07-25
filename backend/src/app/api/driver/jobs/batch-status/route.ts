import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActiveDriver } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { BATCH_ALLOWED_STATUSES, DRIVER_ALLOWED_TRANSITIONS, JobStatus } from "@/lib/constants";

const schema = z.object({
  jobIds: z.array(z.string().min(1)).min(1).max(50),
  status: z.enum(BATCH_ALLOWED_STATUSES),
});

const TIMESTAMP_FIELD: Record<string, string> = {
  ACCEPTED: "acceptedAt",
  ARRIVED: "arrivedAt",
  ON_THE_WAY: "onTheWayAt",
};

// Lets a driver move several assigned jobs forward one step at once (e.g.
// "Out for Delivery" on a batch of stops) without a photo per job — only the
// three non-photo, non-terminal transitions are eligible (see
// BATCH_ALLOWED_STATUSES); PICKED_UP/DELIVERED still require the driver to
// open each job individually so its proof photo is captured.
export async function PATCH(req: NextRequest) {
  const auth = await requireActiveDriver(req);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, schema);
  if (isError(body)) return body.error;
  const { jobIds, status: nextStatus } = body.data;

  const jobs = await prisma.job.findMany({
    where: { id: { in: jobIds }, driverId: auth.session.sub },
    select: { id: true, status: true },
  });
  const jobsById = new Map(jobs.map((j) => [j.id, j]));

  const updatable: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const id of jobIds) {
    const job = jobsById.get(id);
    if (!job) {
      skipped.push({ id, reason: "Not found" });
      continue;
    }
    const allowed = DRIVER_ALLOWED_TRANSITIONS[job.status as JobStatus] ?? [];
    if (!allowed.includes(nextStatus)) {
      skipped.push({ id, reason: `Cannot move from ${job.status} to ${nextStatus}` });
      continue;
    }
    updatable.push(id);
  }

  if (updatable.length > 0) {
    await prisma.job.updateMany({
      where: { id: { in: updatable } },
      data: { status: nextStatus, [TIMESTAMP_FIELD[nextStatus]]: new Date() },
    });
  }

  return Response.json({ updatedIds: updatable, skipped });
}
