import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActiveDriver } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { MAX_SELFIE_DATA_URL_LENGTH } from "@/lib/constants";

const schema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  selfie: z
    .string()
    .startsWith("data:image/", "selfie must be an image data URL")
    .max(MAX_SELFIE_DATA_URL_LENGTH, "Photo is too large"),
});

export async function POST(req: NextRequest) {
  const auth = await requireActiveDriver(req);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, schema);
  if (isError(body)) return body.error;

  const open = await prisma.timeEntry.findFirst({
    where: { driverId: auth.session.sub, clockOutAt: null },
  });
  if (open) {
    return Response.json({ error: "Already clocked in" }, { status: 409 });
  }

  const entry = await prisma.timeEntry.create({
    data: {
      driverId: auth.session.sub,
      clockInAt: new Date(),
      clockInLat: body.data.lat,
      clockInLng: body.data.lng,
      clockInPhoto: body.data.selfie,
    },
  });
  return Response.json({ entry }, { status: 201 });
}
