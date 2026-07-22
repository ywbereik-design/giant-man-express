import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActiveDriver } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { DRIVER_ALLOWED_TRANSITIONS, JobStatus } from "@/lib/constants";

// Selfie is a compressed JPEG data URL, capped well above what a
// client-side-compressed photo should ever produce — just a sanity bound
// against a broken/huge upload, not a real limit in normal use.
const MAX_SELFIE_LENGTH = 3_000_000;

const schema = z.object({
  status: z.enum(["ACCEPTED", "IN_PROGRESS", "COMPLETED"]),
  selfie: z
    .string()
    .startsWith("data:image/", "selfie must be an image data URL")
    .max(MAX_SELFIE_LENGTH, "Photo is too large")
    .optional(),
});

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
  const { status: nextStatus, selfie } = body.data;

  // Arriving on-site requires a timestamped selfie as proof — this is the
  // ACCEPTED -> IN_PROGRESS transition (the driver app labels it "Arrived").
  if (nextStatus === "IN_PROGRESS" && !selfie) {
    return Response.json({ error: "A selfie is required to mark arrival" }, { status: 400 });
  }

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
    data: {
      status: nextStatus,
      [TIMESTAMP_FIELD[nextStatus]]: new Date(),
      ...(nextStatus === "IN_PROGRESS" ? { arrivedAt: new Date(), arrivalPhoto: selfie } : {}),
    },
    include: { jobType: true, business: true },
  });
  return Response.json({ job: updated });
}
