import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActiveDriver } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import {
  DRIVER_ALLOWED_TRANSITIONS,
  FAILURE_REASONS,
  IMAGE_DATA_URL_PATTERN,
  JobStatus,
  MAX_SELFIE_DATA_URL_LENGTH,
} from "@/lib/constants";

const schema = z.object({
  status: z.enum(["ACCEPTED", "ARRIVED", "PICKED_UP", "ON_THE_WAY", "DELIVERED", "FAILED"]),
  photo: z
    .string()
    .regex(IMAGE_DATA_URL_PATTERN, "photo must be a JPEG or PNG image data URL")
    .max(MAX_SELFIE_DATA_URL_LENGTH, "Photo is too large")
    .optional(),
  // Device GPS at the moment the photo above was captured — only meaningful
  // alongside a PICKED_UP/DELIVERED photo, ignored otherwise.
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  // Required when status is FAILED; ignored for every other status.
  failureReason: z.enum(FAILURE_REASONS).optional(),
});

// Proof-of-pickup and proof-of-delivery photos are required on these two
// specific transitions — mirrors the clock-in selfie requirement, but only
// on the stages that actually hand off physical goods.
const PHOTO_REQUIRED_ON: Partial<Record<JobStatus, "pickupPhoto" | "deliveryPhoto">> = {
  PICKED_UP: "pickupPhoto",
  DELIVERED: "deliveryPhoto",
};

// Geo columns paired with each of the photo transitions above.
const GEO_FIELDS_ON: Partial<Record<JobStatus, { lat: "pickupLat" | "deliveryLat"; lng: "pickupLng" | "deliveryLng" }>> = {
  PICKED_UP: { lat: "pickupLat", lng: "pickupLng" },
  DELIVERED: { lat: "deliveryLat", lng: "deliveryLng" },
};

const TIMESTAMP_FIELD: Record<string, string> = {
  ACCEPTED: "acceptedAt",
  ARRIVED: "arrivedAt",
  PICKED_UP: "pickedUpAt",
  ON_THE_WAY: "onTheWayAt",
  DELIVERED: "deliveredAt",
  FAILED: "failedAt",
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireActiveDriver(req);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, schema);
  if (isError(body)) return body.error;
  const { status: nextStatus } = body.data;

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

  const photoField = PHOTO_REQUIRED_ON[nextStatus];
  // A pickup photo is only meaningful proof against an actual pickup
  // location — if dispatch never set one on the job, don't force a photo.
  // Delivery stays unconditionally required (every job has a dropoff).
  const photoRequired = photoField === "pickupPhoto" ? Boolean(job.pickupAddress) : Boolean(photoField);
  if (photoRequired && !body.data.photo) {
    const label = photoField === "pickupPhoto" ? "pickup" : "delivery";
    return Response.json({ error: `A ${label} photo is required` }, { status: 400 });
  }

  if (nextStatus === "FAILED" && !body.data.failureReason) {
    return Response.json({ error: "A reason is required to mark a job failed" }, { status: 400 });
  }

  const geoFields = GEO_FIELDS_ON[nextStatus];

  const updated = await prisma.job.update({
    where: { id: params.id },
    data: {
      status: nextStatus,
      [TIMESTAMP_FIELD[nextStatus]]: new Date(),
      ...(photoField ? { [photoField]: body.data.photo } : {}),
      ...(geoFields && body.data.lat !== undefined && body.data.lng !== undefined
        ? { [geoFields.lat]: body.data.lat, [geoFields.lng]: body.data.lng }
        : {}),
      ...(nextStatus === "FAILED" ? { failureReason: body.data.failureReason } : {}),
    },
    include: { jobType: true, business: true, dropoffStops: { orderBy: { sequence: "asc" } } },
  });
  return Response.json({ job: updated });
}
