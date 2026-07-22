import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActiveDriver } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { DRIVER_ALLOWED_TRANSITIONS, JobStatus } from "@/lib/constants";

const schema = z.object({ status: z.enum(["ACCEPTED", "IN_PROGRESS", "COMPLETED"]) });

const TIMESTAMP_FIELD: Record<string, string> = {
  ACCEPTED: "acceptedAt",
  IN_PROGRESS: "startedAt",
  COMPLETED: "completedAt",
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireActiveDriver(req);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, schema);
  if (isError(body)) return body.error;
  const nextStatus = body.data.status;

  const job = await prisma.job.findUnique({ where: { id: params.id } });
  if (!job || job.driverId !== auth.session.sub) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = DRIVER_ALLOWED_TRANSITIONS[job.status as JobStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    return Response.json(
      { error: `Cannot move job from ${job.status} to ${nextStatus}` },
      { status: 400 }
    );
  }

  const updated = await prisma.job.update({
    where: { id: params.id },
    data: { status: nextStatus, [TIMESTAMP_FIELD[nextStatus]]: new Date() },
    include: { jobType: true, business: true },
  });
  return Response.json({ job: updated });
}
