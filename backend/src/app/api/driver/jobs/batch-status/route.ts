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

// The one status a job must currently be in for `nextStatus` to be a legal
// move — derived from DRIVER_ALLOWED_TRANSITIONS rather than hardcoded, so
// it can't drift out of sync with it. Used to re-check each job's status
// atomically inside the updateMany's WHERE clause below, not just at the
// earlier read — closing the gap where a concurrent single-job status
// update (including one replayed from the offline queue) lands between
// this route's read and write.
function sourceStatusFor(nextStatus: JobStatus): JobStatus | null {
  for (const [from, targets] of Object.entries(DRIVER_ALLOWED_TRANSITIONS)) {
    if (targets.includes(nextStatus)) return from as JobStatus;
  }
  return null;
}

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
  // Deduped so a client sending the same id twice can't inflate updatedIds
  // beyond the number of jobs actually touched.
  const jobIds = Array.from(new Set(body.data.jobIds));
  const { status: nextStatus } = body.data;

  const sourceStatus = sourceStatusFor(nextStatus);

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

  let updatedIds: string[] = [];
  if (updatable.length > 0 && sourceStatus) {
    // Re-checks status in the WHERE clause at write time, not just at the
    // read above — a job that raced to a different status in between (e.g.
    // a single-job update, including one replayed from the driver's offline
    // queue) simply won't match and is silently excluded here rather than
    // having its status forced backward with a now-inconsistent timestamp.
    const result = await prisma.job.updateMany({
      where: { id: { in: updatable }, status: sourceStatus },
      data: { status: nextStatus, [TIMESTAMP_FIELD[nextStatus]]: new Date() },
    });
    if (result.count === updatable.length) {
      updatedIds = updatable;
    } else {
      // Some jobs no longer matched at write time — re-fetch to report
      // accurately instead of claiming the full original list succeeded.
      const stillMatching = await prisma.job.findMany({
        where: { id: { in: updatable }, status: nextStatus },
        select: { id: true },
      });
      const matchedIds = new Set(stillMatching.map((j) => j.id));
      updatedIds = updatable.filter((id) => matchedIds.has(id));
      for (const id of updatable) {
        if (!matchedIds.has(id)) skipped.push({ id, reason: "Job's status changed before this update was applied" });
      }
    }
  }

  return Response.json({ updatedIds, skipped });
}
